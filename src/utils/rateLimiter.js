// In-memory sliding-window rate limiter, keyed per socket per event.
// Single-process only — same limitation as otpStore/userSocketMap (see state/presence.js).
// Wrap a socket handler: socket.on('event', rateLimited(socket, 'event', {max, windowMs}, handler))

const buckets = new Map(); // socketId -> Map<event, timestamps[]>

const rateLimited = (socket, eventName, { max = 20, windowMs = 10000 } = {}, handler) => {
    return async (...args) => {
        const now = Date.now();
        let socketBucket = buckets.get(socket.id);
        if (!socketBucket) {
            socketBucket = new Map();
            buckets.set(socket.id, socketBucket);
        }
        let timestamps = socketBucket.get(eventName) || [];
        timestamps = timestamps.filter((t) => now - t < windowMs);
        if (timestamps.length >= max) {
            socket.emit('rate:limited', { event: eventName, retryAfterMs: windowMs - (now - timestamps[0]) });
            return;
        }
        timestamps.push(now);
        socketBucket.set(eventName, timestamps);
        return handler(...args);
    };
};

const clearSocketBuckets = (socketId) => buckets.delete(socketId);

module.exports = { rateLimited, clearSocketBuckets };
