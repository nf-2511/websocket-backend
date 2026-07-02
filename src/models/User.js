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
}, { timestamps: true });

// Keep age in sync with birthDate
userSchema.pre('save', function () {
    if (this.birthDate) {
        this.age = Math.floor((Date.now() - this.birthDate.getTime()) / 3.15576e10);
    }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
