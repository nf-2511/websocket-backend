const User = require('../models/User');
const presence = require('../state/presence');

// Tells every contact of `userId` that they went online/offline (only their DM/group
// partners, not the whole user base — keeps this from being a global broadcast).
const notifyContacts = async (io, userId, event) => {
    try {
        const user = await User.findById(userId).select('chats');
        if (!user) return;
        for (const contactId of user.chats) {
            for (const socketId of presence.getSockets(contactId)) {
                io.to(socketId).emit(event, { userId: String(userId) });
            }
        }
    } catch (error) {
        console.error(`${event} notify error:`, error);
    }
};

const registerPresenceHandlers = (io, socket) => {
    // socket.userId only comes from a JWT verified at handshake (see socketAuth.js) —
    // never trust a client-supplied userId here, that would let any socket impersonate anyone.
    socket.on('user:online', () => {
        if (!socket.userId) return;
        socket.join(`user:${socket.userId}`);
        const wasOffline = presence.addSocket(socket.userId, socket.id);
        if (wasOffline) notifyContacts(io, socket.userId, 'presence:online');
    });

    socket.on('presence:check', ({ userIds } = {}, ack) => {
        if (typeof ack !== 'function') return;
        const online = (userIds || []).filter((id) => presence.isOnline(id));
        ack(online);
    });

    socket.on('typing:start', ({ conversationId } = {}) => {
        if (!socket.userId || !conversationId) return;
        socket.to(conversationId).emit('typing:start', { conversationId, userId: socket.userId });
    });

    socket.on('typing:stop', ({ conversationId } = {}) => {
        if (!socket.userId || !conversationId) return;
        socket.to(conversationId).emit('typing:stop', { conversationId, userId: socket.userId });
    });
};

module.exports = { registerPresenceHandlers, notifyContacts };
