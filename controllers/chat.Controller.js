const ChatModel = require('../models/Chat.model');
const UserModel = require("../models/User.model");
const { getIO } = require('../socketio'); // Import Socket.IO instance

exports.sendMessage = async(req, res) => {
    try {
        const { senderId, receiverId, message } = req.body; // Get request data


        // Verify sender and receiver exist
        const sender = await UserModel.findById(senderId);
        const receiver = await UserModel.findById(receiverId);

        if (!sender || !receiver) {
            return res.status(404).json({ message: 'Sender or Receiver not found' });
        }

        // Save chat message to the database
        const chat = new ChatModel({
            sender: senderId,
            receiver: receiverId,
            message
        });

        await chat.save();
        console.log('chat message saved in database:', chat);

        const io = getIO();
        console.log(`Emitting chat message to receiver room: ${receiverId}`);


        io.emit('receive_chatMessage', {
            sender: sender.firstname,
            message,
            createdAt: chat.createdAt
        });

        console.log('chat message emitted successfully');

        // Send response back to client
        res.status(200).json({
            message: 'chat message sent successfully',
            chat
        });

    } catch (error) {
        console.error('Error sending message chat:', error);
        res.status(500).json({
            message: 'Error sending message chat',
            error: error.message
        });
    }
};