const UserModel = require('../models/User.model');
const mongoose = require('mongoose');

const Schema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: UserModel, required: true }, // Sender ID
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: UserModel, required: true }, // Receiver ID
    message: { type: String, required: true }, // chat content
    createdAt: { type: Date, default: Date.now }, // Timestamp
    isRead: { type: Boolean, default: false } // chat status (read/unread)
});

module.exports = mongoose.model('Chat', Schema);