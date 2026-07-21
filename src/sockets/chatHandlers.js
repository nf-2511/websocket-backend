const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { requireAuth } = require('../middleware/socketAuth');
const { rateLimited } = require('../utils/rateLimiter');
const presence = require('../state/presence');
const { sendPushToUser } = require('../services/pushService');

const HISTORY_PAGE_SIZE = 30;

const assertMember = async (conversationId, userId) => {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return null;
    if (!conversation.participants.some((id) => String(id) === String(userId))) return null;
    return conversation;
};

const registerChatHandlers = (io, socket) => {
    socket.on(
        'message:send',
        rateLimited(socket, 'message:send', { max: 30, windowMs: 10000 }, async (payload = {}, ack) => {
            if (requireAuth(socket, 'message:send')) return;
            const { conversationId, text, encrypted, iv, attachments, replyTo } = payload;
            if (!conversationId || (!text && !(attachments || []).length)) return;

            try {
                const conversation = await assertMember(conversationId, socket.userId);
                if (!conversation) return typeof ack === 'function' && ack({ error: 'Not a member' });

                const message = await Message.create({
                    conversationId,
                    senderId: socket.userId,
                    text: text || '',
                    encrypted: !!encrypted,
                    iv: iv || '',
                    attachments: attachments || [],
                    replyTo: replyTo || null,
                });

                const preview = encrypted ? '🔒 Encrypted message' : (text || '📎 Attachment').slice(0, 80);
                conversation.lastMessageAt = message.createdAt;
                conversation.lastMessagePreview = preview;
                await conversation.save();

                const populated = await message.populate('senderId', '_id firstName lastName email');
                io.to(String(conversationId)).emit('message:receive', { message: populated });
                if (typeof ack === 'function') ack({ message: populated });

                // Legacy DM contact-list sidebar push + push notification for offline recipients.
                if (!conversation.isGroup) {
                    const otherId = conversation.participants.find((id) => String(id) !== socket.userId);
                    if (otherId) {
                        await Promise.all([
                            User.findByIdAndUpdate(socket.userId, { $addToSet: { chats: otherId } }),
                            User.findByIdAndUpdate(otherId, { $addToSet: { chats: socket.userId } }),
                        ]);
                        if (!presence.isOnline(otherId)) {
                            const recipient = await User.findById(otherId).select('pushSubscriptions');
                            const sender = await User.findById(socket.userId).select('firstName lastName');
                            sendPushToUser(recipient, {
                                title: `${sender.firstName} ${sender.lastName}`,
                                body: preview,
                                conversationId: String(conversationId),
                            }).catch((e) => console.error('push send error:', e));
                        }
                    }
                }
            } catch (error) {
                console.error('message:send error:', error);
                if (typeof ack === 'function') ack({ error: 'Server error' });
            }
        })
    );

    socket.on('message:history', async ({ conversationId, before } = {}, ack) => {
        if (requireAuth(socket, 'message:history')) return;
        try {
            const conversation = await assertMember(conversationId, socket.userId);
            if (!conversation) return typeof ack === 'function' && ack({ error: 'Not a member' });

            const query = { conversationId };
            if (before) query.createdAt = { $lt: new Date(before) };
            const messages = await Message.find(query)
                .sort({ createdAt: -1 })
                .limit(HISTORY_PAGE_SIZE)
                .populate('senderId', '_id firstName lastName email');
            const hasMore = messages.length === HISTORY_PAGE_SIZE;
            if (typeof ack === 'function') ack({ messages: messages.reverse(), hasMore });
        } catch (error) {
            console.error('message:history error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('message:edit', async ({ messageId, text } = {}, ack) => {
        if (requireAuth(socket, 'message:edit')) return;
        try {
            const message = await Message.findById(messageId);
            if (!message || String(message.senderId) !== socket.userId || message.deletedAt) {
                return typeof ack === 'function' && ack({ error: 'Cannot edit' });
            }
            message.text = text || '';
            message.editedAt = new Date();
            await message.save();
            io.to(String(message.conversationId)).emit('message:edited', {
                messageId: String(message._id),
                text: message.text,
                editedAt: message.editedAt,
            });
            if (typeof ack === 'function') ack({ ok: true });
        } catch (error) {
            console.error('message:edit error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('message:delete', async ({ messageId } = {}, ack) => {
        if (requireAuth(socket, 'message:delete')) return;
        try {
            const message = await Message.findById(messageId);
            if (!message || String(message.senderId) !== socket.userId) {
                return typeof ack === 'function' && ack({ error: 'Cannot delete' });
            }
            message.deletedAt = new Date();
            message.text = '';
            message.attachments = [];
            await message.save();
            io.to(String(message.conversationId)).emit('message:deleted', { messageId: String(message._id) });
            if (typeof ack === 'function') ack({ ok: true });
        } catch (error) {
            console.error('message:delete error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });

    socket.on('message:react', async ({ messageId, emoji } = {}) => {
        if (requireAuth(socket, 'message:react')) return;
        if (!emoji) return;
        try {
            const message = await Message.findById(messageId);
            if (!message) return;
            message.reactions = message.reactions.filter((r) => String(r.userId) !== socket.userId);
            message.reactions.push({ userId: socket.userId, emoji });
            await message.save();
            io.to(String(message.conversationId)).emit('message:reacted', {
                messageId: String(message._id),
                reactions: message.reactions,
            });
        } catch (error) {
            console.error('message:react error:', error);
        }
    });

    socket.on('message:unreact', async ({ messageId } = {}) => {
        if (requireAuth(socket, 'message:unreact')) return;
        try {
            const message = await Message.findById(messageId);
            if (!message) return;
            message.reactions = message.reactions.filter((r) => String(r.userId) !== socket.userId);
            await message.save();
            io.to(String(message.conversationId)).emit('message:reacted', {
                messageId: String(message._id),
                reactions: message.reactions,
            });
        } catch (error) {
            console.error('message:unreact error:', error);
        }
    });

    socket.on('message:read', async ({ conversationId, messageId } = {}) => {
        if (requireAuth(socket, 'message:read')) return;
        try {
            const message = await Message.findById(messageId);
            if (!message || String(message.conversationId) !== String(conversationId)) return;
            if (!message.readBy.some((r) => String(r.userId) === socket.userId)) {
                message.readBy.push({ userId: socket.userId, readAt: new Date() });
                await message.save();
            }
            socket.to(conversationId).emit('message:read-receipt', {
                conversationId,
                messageId,
                userId: socket.userId,
                readAt: new Date(),
            });
        } catch (error) {
            console.error('message:read error:', error);
        }
    });

    socket.on('messages:search', async ({ query, conversationId } = {}, ack) => {
        if (requireAuth(socket, 'messages:search')) return;
        if (!query || !query.trim()) return typeof ack === 'function' && ack({ messages: [] });
        try {
            const memberOf = await Conversation.find({ participants: socket.userId }).select('_id');
            const allowedIds = memberOf.map((c) => String(c._id));
            const scopedIds = conversationId ? [conversationId].filter((id) => allowedIds.includes(id)) : allowedIds;

            const messages = await Message.find({
                conversationId: { $in: scopedIds },
                encrypted: false,
                deletedAt: null,
                $text: { $search: query.trim() },
            })
                .limit(50)
                .populate('senderId', '_id firstName lastName email');
            if (typeof ack === 'function') ack({ messages });
        } catch (error) {
            console.error('messages:search error:', error);
            if (typeof ack === 'function') ack({ error: 'Server error' });
        }
    });
};

module.exports = { registerChatHandlers };
