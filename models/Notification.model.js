const UserModel = require('../models/User.model');
const RoomModel = require('../models/Room.model');
const mongoose = require('mongoose');

const Schema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: UserModel, required: true }, // Sender ID
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: UserModel, required: true }, // Receiver ID
    message: { type: String, required: true }, // Notification content
    createdAt: { type: Date, default: Date.now }, // Timestamp
    isRead: { type: Boolean, default: false }, // Notification status (read/unread)
    status: { type: String, enum: ['pending', 'accepted', 'refused'], default: 'pending' },
    type: { type: String, enum: ['contact', 'binome', 'alert', 'binome-accepted', 'rejected'], default: 'contact' },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: RoomModel }
});

module.exports = mongoose.model('Notification', Schema);