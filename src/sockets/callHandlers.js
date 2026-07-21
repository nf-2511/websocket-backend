const User = require('../models/User');
const { requireAuth } = require('../middleware/socketAuth');
const presence = require('../state/presence');

// Pure signaling relay — no persistence, no TURN server configured (STUN-only on the
// client), so calls across strict/symmetric NATs may fail to connect. See CallModal.jsx.
const registerCallHandlers = (io, socket) => {
    const relay = (event) => async (payload = {}) => {
        if (requireAuth(socket, event)) return;
        const { toUserId } = payload;
        if (!toUserId) return;
        // Blocked users must not be able to ring each other; the rest of the relay
        // events only flow inside an invite the callee already saw.
        if (event === 'call:invite') {
            try {
                const [me, other] = await Promise.all([
                    User.findById(socket.userId).select('blockedUsers'),
                    User.findById(toUserId).select('blockedUsers'),
                ]);
                const blocked =
                    !other ||
                    (me?.blockedUsers || []).some((id) => String(id) === String(toUserId)) ||
                    (other.blockedUsers || []).some((id) => String(id) === String(socket.userId));
                if (blocked) {
                    socket.emit('call:unavailable', { toUserId });
                    return;
                }
            } catch (error) {
                console.error('call:invite block check error:', error);
                return;
            }
        }
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
