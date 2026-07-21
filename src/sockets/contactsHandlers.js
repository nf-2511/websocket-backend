const User = require('../models/User');
const { escapeRegex } = require('../utils/auth');
const { requireAuth } = require('../middleware/socketAuth');

const registerContactsHandlers = (io, socket) => {
    socket.on('user:get-chats', async (_payload, ack) => {
        if (requireAuth(socket, 'user:get-chats')) {
            if (typeof ack === 'function') ack([]);
            return;
        }
        try {
            const user = await User.findById(socket.userId).populate('chats', '_id firstName lastName email avatarUrl');
            const chats = (user?.chats || []).filter((c) => String(c._id) !== socket.userId);
            if (user && chats.length !== user.chats.length) {
                User.updateOne({ _id: socket.userId }, { $pull: { chats: socket.userId } }).catch(() => {});
            }
            if (typeof ack === 'function') ack(chats);
            else socket.emit('chats:list', chats);
        } catch (error) {
            console.error('user:get-chats error:', error);
            if (typeof ack === 'function') ack([]);
            else socket.emit('chats:list', []);
        }
    });

    socket.on('user:update-profile', async ({ firstName, lastName, bio, avatarUrl } = {}, ack) => {
        if (requireAuth(socket, 'user:update-profile')) return;
        try {
            const update = {};
            if (firstName !== undefined) update.firstName = firstName.trim().slice(0, 60);
            if (lastName !== undefined) update.lastName = lastName.trim().slice(0, 60);
            if (bio !== undefined) update.bio = bio.slice(0, 280);
            if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;
            const user = await User.findByIdAndUpdate(socket.userId, update, { new: true });
            if (typeof ack === 'function') {
                ack({
                    user: {
                        _id: user._id,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        role: user.role,
                        avatarUrl: user.avatarUrl,
                        bio: user.bio,
                    },
                });
            }
        } catch (error) {
            console.error('user:update-profile error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('users:search', async ({ query } = {}, ack) => {
        const respond = (payload) => {
            if (typeof ack === 'function') ack(payload);
            else socket.emit('users:search-result', payload);
        };
        if (requireAuth(socket, 'users:search')) return respond([]);
        if (!query || query.trim().length < 1) return respond([]);
        try {
            const me = await User.findById(socket.userId).select('blockedUsers');
            const regex = new RegExp(escapeRegex(query.trim()), 'i');
            const users = await User.find({
                $or: [{ firstName: regex }, { lastName: regex }, { email: regex }],
                _id: { $ne: socket.userId, $nin: me?.blockedUsers || [] },
                banned: { $ne: true },
            })
                .select('_id firstName lastName email age avatarUrl')
                .sort({ createdAt: -1 })
                .limit(20);
            respond(users);
        } catch (error) {
            console.error('users:search error:', error);
            respond([]);
        }
    });
};

module.exports = { registerContactsHandlers };
