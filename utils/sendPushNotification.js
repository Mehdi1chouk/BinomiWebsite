const webpush = require('./webPush');
const PushSubscriptionModel = require('../models/PushSubscription.model');

// The whole point of push is reaching a user whose tab is closed — sending
// it must never block or fail the request that triggered it (the in-app
// notification/socket emit already happened by the time this runs).
const sendPushToUser = async (userId, payload) => {
    const subscriptions = await PushSubscriptionModel.find({ user: userId }).lean();
    if (subscriptions.length === 0) return;

    await Promise.all(subscriptions.map(async (sub) => {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: sub.keys },
                JSON.stringify(payload)
            );
        } catch (err) {
            // 404/410 means the browser itself dropped this subscription
            // (unsubscribed, uninstalled, expired) — nothing will ever
            // succeed against it again, so stop storing it.
            if (err.statusCode === 404 || err.statusCode === 410) {
                await PushSubscriptionModel.deleteOne({ _id: sub._id }).catch(() => {});
            } else {
                console.error('Push send failed:', err.message);
            }
        }
    }));
};

const sendPushToUsers = async (userIds, payload) => {
    await Promise.all(userIds.map((id) => sendPushToUser(id, payload)));
};

module.exports = { sendPushToUser, sendPushToUsers };
