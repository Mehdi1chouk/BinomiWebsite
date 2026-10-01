const webpush = require('web-push');

webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@binomy.tn',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

module.exports = webpush;
