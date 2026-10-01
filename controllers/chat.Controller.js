const ChatModel = require('../models/Chat.model');
const UserModel = require("../models/User.model");
const { getIO } = require('../socketio'); // Import Socket.IO instance
const mongoose = require('mongoose');
const { API_BASE_URL } = require('../utils/apiBaseUrl');
const { sendPushToUser } = require('../utils/sendPushNotification');


exports.sendMessage = async (req, res) => {
    try {
      // Get sender from authenticated user
      const senderId = req.user._id; 
      // Receiver is the "conversationId" parameter
      const receiverId = req.params.conversationId;
      const { message } = req.body;
  
      // Validate input
      if (!mongoose.isValidObjectId(receiverId) || !message) {
        return res.status(400).json({ message: 'Invalid request' });
      }
  
      // Verify receiver exists
      const receiver = await UserModel.findById(receiverId);
      if (!receiver) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      // Save message
      const chat = new ChatModel({
        sender: senderId,
        receiver: receiverId,
        message
      });
      await chat.save();
      
  
      // Socket.IO emit (optional)
      const io = getIO();
      // In sendMessage controller
      io.to(receiverId.toString()).emit('new_message', chat);  // Only receiver gets it

      // No sender name here on purpose — this runs on every single message
      // sent, the highest-frequency action in the app, and isn't worth an
      // extra DB query just to personalize a push title.
      sendPushToUser(receiverId, {
        title: 'Nouveau message',
        body: message,
        url: '/app/conversations'
      }).catch(() => {});

      res.status(200).json(chat);
      
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ message: 'Error sending message', error: error.message });
    }
  };
  

// Get all conversations for a user — summaries only (last message, unread
// count). Message history is NOT embedded here anymore: it used to $push
// every single message the user ever sent/received into this response,
// which meant opening the conversations list re-fetched a user's entire
// chat history every time. Full history is now fetched per-conversation,
// on demand, via getMessages below.
exports.getConversations = async (req, res) => {
    try {
      const userId = req.user._id;
      const userObjectId = new mongoose.Types.ObjectId(userId);

      const conversations = await ChatModel.aggregate([
        {
          $match: {
            $or: [{ sender: userObjectId }, { receiver: userObjectId }]
          }
        },
        {
          $sort: { createdAt: -1 }
        },
        {
          $group: {
            _id: {
              $cond: [{ $eq: ["$sender", userObjectId] }, "$receiver", "$sender"]
            },
            lastMessage: { $first: "$message" },
            lastMessageDate: { $first: "$createdAt" },
            unreadCount: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$receiver", userObjectId] }, { $eq: ["$isRead", false] }] },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "userData"
          }
        },
        {
          $project: {
            id: "$_id",
            userName: { $arrayElemAt: ["$userData.firstname", 0] },
            userImage: {
              $cond: [
                { $ne: [{ $arrayElemAt: ["$userData.photo", 0] }, null] },
                {
                  $concat: [
                    `${API_BASE_URL}/`,
                    { $replaceOne: { input: { $arrayElemAt: ["$userData.photo", 0] }, find: "\\", replacement: "/" } }
                  ]
                },
                null
              ]
            },
            lastMessage: 1,
            lastMessageDate: 1,
            unreadCount: 1
          }
        },
        {
          $sort: { lastMessageDate: -1 }
        }
      ]);

      res.status(200).json(conversations);
    } catch (error) {
      console.error('Error getting conversations:', error);
      res.status(500).json({
        message: 'Error getting conversations',
        error: error.message
      });
    }
  };
  

  
  // Get messages for a specific conversation, newest page first. A
  // conversation that's run for years could have thousands of messages —
  // loading all of them on every open doesn't scale, so this returns the
  // most recent `limit` (capped at 100) and, when `before` (an ISO
  // timestamp) is supplied, the next page further back for "load older".
  exports.getMessages = async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id;
      const limit = Math.min(parseInt(req.query.limit) || 30, 100);
      const before = req.query.before ? new Date(req.query.before) : null;

      // Find the other user in this conversation
      const otherUser = await UserModel.findById(conversationId);

      if (!otherUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      const query = {
        $or: [
          { sender: userId, receiver: conversationId },
          { sender: conversationId, receiver: userId }
        ]
      };
      if (before && !isNaN(before.getTime())) {
        query.createdAt = { $lt: before };
      }

      // Fetch newest-first so `limit` grabs the most recent page, then
      // reverse for chronological display. Asking for one extra row reveals
      // whether an older page still exists without a separate count query.
      const rows = await ChatModel.find(query).sort({ createdAt: -1 }).limit(limit + 1);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit).reverse();

      const formattedMessages = page.map(msg => ({
        id: msg._id,
        content: msg.message,
        sender: msg.sender.toString() === userId.toString() ? "me" : "other",
        timestamp: msg.createdAt
      }));

      res.status(200).json({ messages: formattedMessages, hasMore });
    } catch (error) {
      console.error('Error getting messages:', error);
      res.status(500).json({
        message: 'Error getting messages',
        error: error.message
      });
    }
  };


exports.getUnreadMessagesCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const unreadCount = await ChatModel.countDocuments({
      receiver: userId,
      isRead: false
    });

    res.status(200).json({ count: unreadCount });
  } catch (error) {
    res.status(500).json({ message: "Error counting unread messages" });
  }
};


exports.markMessagesAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { conversationId } = req.params;

    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

     const result = await ChatModel.updateMany(
      {
        sender: conversationId,
        receiver: userId,
        isRead: false
      },
      { $set: { isRead: true } }
    );

    // Notify the reader's OWN other sessions/tabs so their unread badge
    // updates immediately — the navbar listens for this on its own room
    // (joined via register_user) and checks readBy === itself, so this must
    // target userId's room, not the other party's.
    const io = getIO();
    io.to(userId.toString()).emit('messages_read', {
      readBy: userId,
      conversationId: conversationId
    });

    res.status(200).json({ 
      message: 'Messages marked as read',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


