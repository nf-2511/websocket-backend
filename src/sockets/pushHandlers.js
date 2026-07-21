const User = require('../models/User');
const { requireAuth } = require('../middleware/socketAuth');

const registerPushHandlers = (io, socket) => {
    socket.on('push:subscribe', async ({ subscription } = {}, ack) => {
        if (requireAuth(socket, 'push:subscribe')) return;
        if (!subscription?.endpoint) return;
        try {
            await User.findByIdAndUpdate(socket.userId, {
                $addToSet: {
                    pushSubscriptions: { endpoint: subscription.endpoint, keys: subscription.keys },
                },
            });
            if (typeof ack === 'function') ack({ ok: true });
        } catch (error) {
            console.error('push:subscribe error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('push:unsubscribe', async ({ endpoint } = {}, ack) => {
        if (requireAuth(socket, 'push:unsubscribe')) return;
        try {
            await User.findByIdAndUpdate(socket.userId, { $pull: { pushSubscriptions: { endpoint } } });
            if (typeof ack === 'function') ack({ ok: true });
        } catch (error) {
            console.error('push:unsubscribe error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });
};

module.exports = { registerPushHandlers };
