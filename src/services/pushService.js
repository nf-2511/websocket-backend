const webpush = require('web-push');

let configured = false;

const ensureConfigured = () => {
    if (configured) return true;
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
    webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
    return true;
};

// Sends to every subscription for a user; drops subscriptions the browser has revoked (410/404).
const sendPushToUser = async (user, payload) => {
    if (!ensureConfigured()) return;
    if (!user?.pushSubscriptions?.length) return;
    const stale = [];
    await Promise.all(
        user.pushSubscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(sub, JSON.stringify(payload));
            } catch (err) {
                if (err.statusCode === 404 || err.statusCode === 410) stale.push(sub.endpoint);
                else console.error('web-push send error:', err.message);
            }
        })
    );
    if (stale.length) {
        user.pushSubscriptions = user.pushSubscriptions.filter((s) => !stale.includes(s.endpoint));
        await user.save();
    }
};

module.exports = { sendPushToUser, ensureConfigured };
