const { registerAuthHandlers } = require('./authHandlers');
const { registerPresenceHandlers, notifyContacts } = require('./presenceHandlers');
const { registerConversationHandlers } = require('./conversationHandlers');
const { registerChatHandlers } = require('./chatHandlers');
const { registerModerationHandlers } = require('./moderationHandlers');
const { registerContactsHandlers } = require('./contactsHandlers');
const { registerCallHandlers } = require('./callHandlers');
const { registerPushHandlers } = require('./pushHandlers');
const presence = require('../state/presence');
const { clearSocketBuckets } = require('../utils/rateLimiter');
const { logSocketEvent } = require('../utils/eventLogger');

const registerSocketHandlers = (io, socket) => {
    console.log('User connected:', socket.id, socket.userId ? `(userId=${socket.userId})` : '');

    // Human-readable log line for every incoming event (see utils/eventLogger).
    socket.onAny((event, payload) => logSocketEvent(socket, event, payload));

    registerAuthHandlers(io, socket);
    registerPresenceHandlers(io, socket);
    registerConversationHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerModerationHandlers(io, socket);
    registerContactsHandlers(io, socket);
    registerCallHandlers(io, socket);
    registerPushHandlers(io, socket);

    socket.on('disconnect', () => {
        clearSocketBuckets(socket.id);
        const { userId, wentOffline } = presence.removeSocketByIdOnly(socket.id);
        if (wentOffline && userId) notifyContacts(io, userId, 'presence:offline');
        console.log('User disconnected:', socket.id);
    });
};

module.exports = { registerSocketHandlers };
