const PushSubscriptionModel = require('../models/PushSubscription.model');

exports.getPublicKey = (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
};

exports.subscribe = async (req, res) => {
    try {
        const { endpoint, keys } = req.body;
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ message: 'Invalid push subscription' });
        }

        // Upsert by endpoint (the browser's own unique id for this
        // subscription) so re-enabling on the same browser updates in place
        // instead of piling up duplicate rows, and correctly reassigns it if
        // a different account was last signed in on this device.
        await PushSubscriptionModel.findOneAndUpdate(
            { endpoint },
            { user: req.user._id, endpoint, keys },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ message: 'Error saving push subscription', error: err.message });
    }
};

exports.unsubscribe = async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) {
            return res.status(400).json({ message: 'endpoint is required' });
        }

        await PushSubscriptionModel.deleteOne({ endpoint, user: req.user._id });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ message: 'Error removing push subscription', error: err.message });
    }
};
