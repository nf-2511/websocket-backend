const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    firstName: {
        type: String,
        required: true,
    },
    lastName: {
        type: String,
        required: true,
    },
    birthDate: {
        type: Date,
        required: true,
    },
    password: {
        type: String,
        select: false, // scrypt hash "salt:hash" — never sent to clients
    },
    age: {
        type: Number,
    },
    contacts: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'User',
        default: [],
    },
    chats: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'User',
        default: [],
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
    },
    banned: {
        type: Boolean,
        default: false,
    },
    blockedUsers: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'User',
        default: [],
    },
    avatarUrl: {
        type: String,
        default: '',
    },
    bio: {
        type: String,
        default: '',
        maxlength: 280,
    },
    // Base64 SPKI-exported ECDH (P-256) public key, published by the client for E2E-encrypted DMs.
    publicKey: {
        type: String,
        default: '',
    },
    pushSubscriptions: {
        type: [
            {
                endpoint: String,
                keys: { p256dh: String, auth: String },
            },
        ],
        default: [],
    },
}, { timestamps: true });

// Keep age in sync with birthDate
userSchema.pre('save', function () {
    if (this.birthDate) {
        this.age = Math.floor((Date.now() - this.birthDate.getTime()) / 3.15576e10);
    }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
