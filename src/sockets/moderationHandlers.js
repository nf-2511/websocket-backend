const User = require('../models/User');
const Report = require('../models/Report');
const { requireAuth } = require('../middleware/socketAuth');

const registerModerationHandlers = (io, socket) => {
    socket.on('user:block', async ({ userId } = {}, ack) => {
        if (requireAuth(socket, 'user:block')) return;
        if (!userId || userId === socket.userId) return;
        try {
            await User.findByIdAndUpdate(socket.userId, { $addToSet: { blockedUsers: userId } });
            if (typeof ack === 'function') ack({ ok: true });
        } catch (error) {
            console.error('user:block error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('user:unblock', async ({ userId } = {}, ack) => {
        if (requireAuth(socket, 'user:unblock')) return;
        try {
            await User.findByIdAndUpdate(socket.userId, { $pull: { blockedUsers: userId } });
            if (typeof ack === 'function') ack({ ok: true });
        } catch (error) {
            console.error('user:unblock error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('user:blocked-list', async (_payload, ack) => {
        if (requireAuth(socket, 'user:blocked-list')) return;
        try {
            const user = await User.findById(socket.userId).populate('blockedUsers', '_id firstName lastName email');
            if (typeof ack === 'function') ack({ blockedUsers: user?.blockedUsers || [] });
        } catch (error) {
            console.error('user:blocked-list error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('report:submit', async ({ targetUserId, messageId, reason } = {}, ack) => {
        if (requireAuth(socket, 'report:submit')) return;
        if (!targetUserId || !reason || !reason.trim()) {
            return typeof ack === 'function' && ack({ error: 'targetUserId and reason are required' });
        }
        try {
            await Report.create({
                reporterId: socket.userId,
                targetUserId,
                messageId: messageId || null,
                reason: reason.trim().slice(0, 500),
            });
            if (typeof ack === 'function') ack({ ok: true });
        } catch (error) {
            console.error('report:submit error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });
};

module.exports = { registerModerationHandlers };
