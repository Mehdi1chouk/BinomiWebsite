const mongoose = require('mongoose');

const ReportSchema = mongoose.Schema({
    reporterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reportedUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        default: 'Inappropriate behavior'
    },
    category: {
        type: String,
        enum: ['harassment', 'fake-profile', 'inappropriate-photo', 'scam', 'spam', 'other'],
        default: 'other'
    }
}, {
    timestamps: true
});

// Ensure a user can only report another user once
ReportSchema.index({ reporterId: 1, reportedUserId: 1 }, { unique: true });

module.exports = mongoose.model('Report', ReportSchema);