const mongoose = require('mongoose');

const BannedEmailSchema = mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        default: 'Multiple reports received'
    },
    reportCount: {
        type: Number,
        default: 3
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('BannedEmail', BannedEmailSchema);