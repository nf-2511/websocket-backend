const { verifyToken } = require('../services/tokenService');

// Socket.IO handshake middleware. Attaches socket.userId/socket.userRole from a verified
// JWT so handlers no longer have to trust whatever userId the client sends in payloads.
// auth:register/login/verify-otp are the only flows allowed to run without a token yet
// attached; the client reconnects with the issued token immediately after.
const ALLOW_UNAUTHENTICATED = new Set(['auth:check-email', 'auth:register', 'auth:login', 'auth:verify-otp']);

const socketAuthMiddleware = (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
        const payload = verifyToken(token);
        if (payload) {
            socket.userId = payload.sub;
            socket.userRole = payload.role;
        }
    }
    next();
};

// Call at the top of any handler that requires an authenticated socket.
// Returns true (and emits an error) if the socket should be blocked.
const requireAuth = (socket, eventName) => {
    if (socket.userId) return false;
    if (ALLOW_UNAUTHENTICATED.has(eventName)) return false;
    socket.emit('auth:error', { message: 'Not authenticated' });
    return true;
};

module.exports = { socketAuthMiddleware, requireAuth };
