const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
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

const User = mongoose.model('User', userSchema);

module.exports = User;
