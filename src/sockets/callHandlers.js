const { requireAuth } = require('../middleware/socketAuth');
const presence = require('../state/presence');

// Pure signaling relay — no persistence, no TURN server configured (STUN-only on the
// client), so calls across strict/symmetric NATs may fail to connect. See CallModal.jsx.
const registerCallHandlers = (io, socket) => {
    const relay = (event) => (payload = {}) => {
        if (requireAuth(socket, event)) return;
        const { toUserId } = payload;
        if (!toUserId) return;
        const targets = presence.getSockets(toUserId);
        if (!targets.length) {
            if (event === 'call:invite') socket.emit('call:unavailable', { toUserId });
            return;
        }
        for (const socketId of targets) {
            io.to(socketId).emit(event, { ...payload, fromUserId: socket.userId });
        }
    };

    socket.on('call:invite', relay('call:invite'));
    socket.on('call:answer', relay('call:answer'));
    socket.on('call:reject', relay('call:reject'));
    socket.on('call:ice-candidate', relay('call:ice-candidate'));
    socket.on('call:end', relay('call:end'));
};

module.exports = { registerCallHandlers };
