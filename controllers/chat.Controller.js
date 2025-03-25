const ChatModel = require('../models/Chat.model');
const UserModel = require("../models/User.model");
const { getIO } = require('../socketio'); // Import Socket.IO instance
const mongoose = require('mongoose');


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

  
      res.status(200).json(chat);
      
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ message: 'Error sending message', error: error.message });
    }
  };
  

// Get all conversations for a user
exports.getConversations = async (req, res) => {
    try {
      const userId = req.user._id;
      
      // Find all chats where the user is either the sender or receiver
      const conversations = await ChatModel.aggregate([
        {
          $match: {
            $or: [{ sender: new mongoose.Types.ObjectId(userId) },
                { receiver: new mongoose.Types.ObjectId(userId) }]
          }
        },
        {
          $sort: { createdAt: -1 }
        },
        {
          $group: {
            _id: {
              $cond: [
                { $eq: ["$sender", new mongoose.Types.ObjectId(userId)] },
                "$receiver",
                "$sender"
              ]
            },
            lastMessage: { $first: "$message" },
            lastMessageDate: { $first: "$createdAt" },
            messages: { 
              $push: {
                id: "$_id",
                content: "$message", 
                sender: {
                  $cond: [
                    { $eq: ["$sender", new mongoose.Types.ObjectId(userId)] },
                    "me",
                    "other"
                  ]
                },
                timestamp: "$createdAt"
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
                    "http://localhost:3003/",
                    { $replaceOne: { input: { $arrayElemAt: ["$userData.photo", 0] }, find: "\\", replacement: "/" } }
                  ]
                },
                null
              ]
            },
            lastMessage: 1,
            messages: 1
          }
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
  

  
  // Get messages for a specific conversation
  exports.getMessages = async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id;
      
      // Find the other user in this conversation
      const otherUser = await UserModel.findById(conversationId);
      
      if (!otherUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Get all messages between these two users
      const messages = await ChatModel.find({
        $or: [
          { sender: userId, receiver: conversationId },
          { sender: conversationId, receiver: userId }
        ]
      }).sort({ createdAt: 1 });
      
      const formattedMessages = messages.map(msg => ({
        id: msg._id,
        content: msg.message,
        sender: msg.sender.toString() === userId.toString() ? "me" : "other",
        timestamp: msg.createdAt
      }));
      
      res.status(200).json(formattedMessages);
    } catch (error) {
      console.error('Error getting messages:', error);
      res.status(500).json({
        message: 'Error getting messages',
        error: error.message
      });
    }
  };