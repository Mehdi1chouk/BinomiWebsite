const mongoose = require('mongoose');

// One document per browser/device a user has enabled push notifications on
// (a user can have several — phone + laptop, etc). `endpoint` is the unique
// URL the browser's own push service issued for that subscription, so it's
// the natural key: re-subscribing the same browser upserts in place instead
// of piling up duplicates.
const Schema = mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true }
    }
}, {
    timestamps: true
});

Schema.index({ user: 1 });

module.exports = mongoose.model('PushSubscription', Schema);
