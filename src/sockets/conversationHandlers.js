const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { requireAuth } = require('../middleware/socketAuth');
const presence = require('../state/presence');

const dmKeyFor = (a, b) => [String(a), String(b)].sort().join('_');

const populateFields = 'participants _id firstName lastName email avatarUrl publicKey';

const registerConversationHandlers = (io, socket) => {
    // Finds or creates the 1:1 conversation with `otherUserId` and joins its room.
    socket.on('conversation:open', async ({ otherUserId } = {}, ack) => {
        if (requireAuth(socket, 'conversation:open')) return;
        if (!otherUserId || otherUserId === socket.userId) return;
        try {
            const [me, other] = await Promise.all([
                User.findById(socket.userId).select('blockedUsers'),
                User.findById(otherUserId).select('blockedUsers'),
            ]);
            if (!other) return typeof ack === 'function' && ack({ error: 'User not found' });
            if (me.blockedUsers.some((id) => String(id) === String(otherUserId)) ||
                other.blockedUsers.some((id) => String(id) === String(socket.userId))) {
                return typeof ack === 'function' && ack({ error: 'Blocked' });
            }

            const dmKey = dmKeyFor(socket.userId, otherUserId);
            let conversation = await Conversation.findOne({ dmKey }).populate('participants', populateFields);
            let isNew = false;
            if (!conversation) {
                try {
                    conversation = await Conversation.create({
                        participants: [socket.userId, otherUserId],
                        isGroup: false,
                        dmKey,
                    });
                    isNew = true;
                } catch (error) {
                    // Both sides opened the DM at once — the unique dmKey index rejected
                    // the second insert; fall back to the winner's document.
                    if (error?.code !== 11000) throw error;
                    conversation = await Conversation.findOne({ dmKey });
                    if (!conversation) throw error;
                }
                conversation = await conversation.populate('participants', populateFields);
            }
            socket.join(String(conversation._id));
            if (isNew) {
                // The opener already has it via the ack below — only the other side needs a push.
                io.to(`user:${otherUserId}`).emit('conversation:new', { conversation });
            }
            if (typeof ack === 'function') ack({ conversation });
        } catch (error) {
            console.error('conversation:open error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('conversation:create-group', async ({ participantIds = [], name } = {}, ack) => {
        if (requireAuth(socket, 'conversation:create-group')) return;
        const uniqueIds = Array.from(new Set([socket.userId, ...participantIds.map(String)]));
        if (uniqueIds.length < 3) {
            return typeof ack === 'function' && ack({ error: 'A group needs at least 2 other members' });
        }
        if (!name || !name.trim()) {
            return typeof ack === 'function' && ack({ error: 'Group name is required' });
        }
        try {
            let conversation = await Conversation.create({
                participants: uniqueIds,
                isGroup: true,
                name: name.trim().slice(0, 80),
                admins: [socket.userId],
            });
            conversation = await conversation.populate('participants', populateFields);
            for (const uid of uniqueIds) {
                io.to(`user:${uid}`).emit('conversation:new', { conversation });
            }
            if (typeof ack === 'function') ack({ conversation });
        } catch (error) {
            console.error('conversation:create-group error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('conversation:add-member', async ({ conversationId, userId } = {}, ack) => {
        if (requireAuth(socket, 'conversation:add-member')) return;
        try {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation || !conversation.isGroup) return typeof ack === 'function' && ack({ error: 'Not found' });
            if (!conversation.admins.some((id) => String(id) === socket.userId)) {
                return typeof ack === 'function' && ack({ error: 'Admins only' });
            }
            if (!conversation.participants.some((id) => String(id) === String(userId))) {
                conversation.participants.push(userId);
                await conversation.save();
            }
            io.to(`user:${userId}`).emit('conversation:new', {
                conversation: await conversation.populate('participants', populateFields),
            });
            io.to(String(conversation._id)).emit('conversation:member-added', { conversationId, userId });
            if (typeof ack === 'function') ack({ ok: true });
        } catch (error) {
            console.error('conversation:add-member error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('conversation:remove-member', async ({ conversationId, userId } = {}, ack) => {
        if (requireAuth(socket, 'conversation:remove-member')) return;
        try {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation || !conversation.isGroup) return typeof ack === 'function' && ack({ error: 'Not found' });
            const isAdmin = conversation.admins.some((id) => String(id) === socket.userId);
            const isSelfLeave = String(userId) === socket.userId;
            if (!isAdmin && !isSelfLeave) return typeof ack === 'function' && ack({ error: 'Admins only' });

            conversation.participants = conversation.participants.filter((id) => String(id) !== String(userId));
            conversation.admins = conversation.admins.filter((id) => String(id) !== String(userId));
            await conversation.save();
            for (const socketId of presence.getSockets(userId)) {
                const memberSocket = io.sockets.sockets.get(socketId);
                if (memberSocket) memberSocket.leave(String(conversation._id));
            }
            io.to(String(conversation._id)).emit('conversation:member-removed', { conversationId, userId });
            io.to(`user:${userId}`).emit('conversation:member-removed', { conversationId, userId });
            if (typeof ack === 'function') ack({ ok: true });
        } catch (error) {
            console.error('conversation:remove-member error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('conversation:list', async (_payload, ack) => {
        if (requireAuth(socket, 'conversation:list')) return;
        try {
            const conversations = await Conversation.find({ participants: socket.userId })
                .populate('participants', populateFields)
                .sort({ lastMessageAt: -1 })
                .limit(100);
            if (typeof ack === 'function') ack({ conversations });
            else socket.emit('conversation:list-result', { conversations });
        } catch (error) {
            console.error('conversation:list error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('conversation:join', async ({ conversationId } = {}) => {
        if (requireAuth(socket, 'conversation:join')) return;
        try {
            const conversation = await Conversation.findById(conversationId).select('participants');
            if (!conversation || !conversation.participants.some((id) => String(id) === socket.userId)) return;
            socket.join(conversationId);
        } catch (error) {
            console.error('conversation:join error:', error);
        }
    });

    socket.on('conversation:leave', ({ conversationId } = {}) => {
        if (!conversationId) return;
        socket.leave(conversationId);
    });
};

module.exports = { registerConversationHandlers, dmKeyFor };
