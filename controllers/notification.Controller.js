const NotificationModel = require('../models/Notification.model');
const UserModel = require("../models/User.model");
const { getIO } = require('../socketio'); // Import Socket.IO instance

exports.sendNotification = async(req, res) => {
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

        // Debug to confirm receiver ID and socket logic
        const io = getIO();
        console.log(`Emitting notification to receiver room: ${receiverId}`);

        // Emit notification to the specific room
        io.emit('receive_notification', {
            sender: sender.firstname,
            message,
            createdAt: notification.createdAt
        });

        console.log('Notification emitted successfully');

        // Send response back to client
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