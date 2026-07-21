// userId -> Set<socketId>, so a user with several tabs/devices open stays "online"
// until the last socket disconnects. Process-local only (no Redis adapter) — a user
// connected to one server instance is invisible to another; fine for a single instance.
const userSocketMap = new Map();

const addSocket = (userId, socketId) => {
    const key = String(userId);
    let sockets = userSocketMap.get(key);
    if (!sockets) {
        sockets = new Set();
        userSocketMap.set(key, sockets);
    }
    sockets.add(socketId);
    return sockets.size === 1; // true if this is the user's first connected socket
};

// Returns true if the user has no more open sockets (went fully offline)
const removeSocket = (userId, socketId) => {
    const key = String(userId);
    const sockets = userSocketMap.get(key);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size === 0) {
        userSocketMap.delete(key);
        return true;
    }
    return false;
};

// disconnect only carries the socket id, not the userId, so we still need a reverse scan
const removeSocketByIdOnly = (socketId) => {
    for (const [userId, sockets] of userSocketMap.entries()) {
        if (sockets.has(socketId)) {
            const wentOffline = removeSocket(userId, socketId);
            return { userId, wentOffline };
        }
    }
    return { userId: null, wentOffline: false };
};

const getSockets = (userId) => Array.from(userSocketMap.get(String(userId)) || []);
const isOnline = (userId) => userSocketMap.has(String(userId));

module.exports = { addSocket, removeSocket, removeSocketByIdOnly, getSockets, isOnline };
