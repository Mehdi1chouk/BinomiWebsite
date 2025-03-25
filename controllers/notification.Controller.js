const NotificationModel = require('../models/Notification.model');
const UserModel = require("../models/User.model");
const { getIO } = require('../socketio'); // Import Socket.IO instance
const ChatModel = require('../models/Chat.model');

const sendNotification = async(req, res) => {
    try {
        const { senderId, receiverId, message } = req.body; // Get request data


        // Verify sender and receiver exist
        const sender = await UserModel.findById(senderId);
        const receiver = await UserModel.findById(receiverId);

        if (!sender || !receiver) {
            return res.status(404).json({ message: 'Sender or Receiver not found' });
        }

        // Save notification to the database
        const notification = new NotificationModel({
            sender: senderId,
            receiver: receiverId,
            message
        });

        await notification.save();
        console.log('Notification saved in database:', notification);






         const populatedNotification = await NotificationModel.findById(notification._id)
            .populate('sender', 'firstname lastname photo');
        
        // Emit notification to all connected clients
        const io = getIO();
        io.emit('receive_notification', {
            _id: notification._id,
            sender: populatedNotification.sender,
            receiverId: receiverId,
            message,
            createdAt: notification.createdAt
        });
        
        res.status(200).json({ 
            message: 'Notification sent successfully',
            notification 
        });
        
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({
            message: 'Error sending notification',
            error: error.message
        });
    }
};


const getNotifications = async(req, res) => {
    try {
        // Get the current user ID from the authenticated request
        const userId = req.user._id;
        
        // Find all notifications for this user
        const notifications = await NotificationModel.find({ receiver: userId })
            .populate('sender', 'firstname lastname photo _id')
            .sort({ createdAt: -1 });
            
        res.status(200).json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            message: 'Error fetching notifications',
            error: error.message
        });
    }
};


// Add these functions to your notification controller

// Handle accepting a notification
const acceptNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id; // From your verifytoken middleware

    // Find the notification and verify it belongs to the current user
    const notification = await NotificationModel.findOne({
      _id: notificationId,
      receiver: userId
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Mark the notification as accepted/read
    notification.isRead = true;
    notification.status = 'accepted'; // Add a status field if you don't have one
    await notification.save();

    // Create a new conversation between the users or find an existing one
    let conversation = await ChatModel.findOne({
      $or: [
        { sender: userId, receiver: notification.sender },
        { sender: notification.sender, receiver: userId }
      ]
    });

    if (!conversation) {
      // Create a new conversation record (initial welcome message)
      conversation = new ChatModel({
        sender: userId,
        receiver: notification.sender,
        message: "Hello! I've accepted your contact request."
      });
      
      await conversation.save();
    }

    // Return the conversation for frontend redirect
    res.status(200).json({
      message: 'Notification accepted successfully',
      notification,
      conversationId: conversation._id
    });

  } catch (error) {
    console.error('Error accepting notification:', error);
    res.status(500).json({
      message: 'Error accepting notification',
      error: error.message
    });
  }
};
  
  // Handle refusing a notification
  const refuseNotification = async (req, res) => {
        try {
      const { notificationId } = req.params;
      const userId = req.user._id; // Assuming your verifytoken middleware adds user to req
  
      // Find the notification and verify it belongs to the current user
      const notification = await NotificationModel.findOne({
        _id: notificationId,
        receiver: userId
      });
  
      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
      }
  
      // Mark as read and update status or just delete it
      // Option 1: Delete the notification
      await NotificationModel.deleteOne({ _id: notificationId });
  
      // Option 2: Mark as read and refused (if you want to keep a record)
      // notification.isRead = true;
      // notification.status = 'refused'; // You would need to add this field to your model
      // await notification.save();
  
      res.status(200).json({ 
        message: 'Notification refused successfully' 
      });
  
    } catch (error) {
      console.error('Error refusing notification:', error);
      res.status(500).json({
        message: 'Error refusing notification',
        error: error.message
      });
    }
  };

module.exports = { sendNotification,getNotifications,acceptNotification,refuseNotification }