const mongoose = require('mongoose');

// One row per moderation action taken from the admin panel — lets multiple
// admins see who did what, and when, instead of actions being silent.
const Schema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    adminName: { type: String, required: true },
    action: {
        type: String,
        required: true,
        enum: ['ban', 'unban', 'alert', 'verify', 'unverify', 'delete-room', 'delete-user', 'broadcast']
    },
    targetType: { type: String, enum: ['user', 'room', 'broadcast'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId },
    details: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('AdminAction', Schema);
