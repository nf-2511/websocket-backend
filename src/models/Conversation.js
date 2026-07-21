const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
    {
        participants: {
            type: [mongoose.Schema.Types.ObjectId],
            ref: 'User',
            required: true,
            validate: (v) => Array.isArray(v) && v.length >= 2,
        },
        isGroup: {
            type: Boolean,
            default: false,
        },
        name: {
            type: String,
            default: '',
            maxlength: 80,
        },
        avatarUrl: {
            type: String,
            default: '',
        },
        admins: {
            type: [mongoose.Schema.Types.ObjectId],
            ref: 'User',
            default: [],
        },
        // For 1:1 DMs only: [id1,id2].sort().join('_') — enforces one conversation per pair.
        // Sparse+unique so groups (which have no dmKey) don't collide on null.
        dmKey: {
            type: String,
            default: undefined,
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
        },
        lastMessagePreview: {
            type: String,
            default: '',
        },
    },
    { timestamps: true }
);

conversationSchema.index({ dmKey: 1 }, { unique: true, sparse: true });
conversationSchema.index({ participants: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
