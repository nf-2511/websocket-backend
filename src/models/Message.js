const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
            index: true,
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // Plaintext for group chats; ciphertext (base64) for E2E-encrypted DMs — see `encrypted`.
        text: {
            type: String,
            default: '',
        },
        // Base64 AES-GCM IV, only set when encrypted === true.
        iv: {
            type: String,
            default: '',
        },
        encrypted: {
            type: Boolean,
            default: false,
        },
        attachments: {
            type: [
                {
                    url: String,
                    name: String,
                    // Mime type. Must be `{ type: String }`: a bare `type: String` here makes
                    // Mongoose read the whole element definition as "array of String", which
                    // rejects every attachment object with a CastError.
                    type: { type: String },
                    size: Number,
                },
            ],
            default: [],
        },
        reactions: {
            type: [
                {
                    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                    emoji: String,
                },
            ],
            default: [],
        },
        readBy: {
            type: [
                {
                    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                    readAt: { type: Date, default: Date.now },
                },
            ],
            default: [],
        },
        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
        editedAt: {
            type: Date,
            default: null,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
// Plaintext-only search index; encrypted DM text is ciphertext and won't match anything meaningful.
messageSchema.index({ text: 'text' });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
