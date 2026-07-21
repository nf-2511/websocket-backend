const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
    {
        reporterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        targetUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        messageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
        reason: {
            type: String,
            required: true,
            maxlength: 500,
        },
        status: {
            type: String,
            enum: ['open', 'reviewed', 'dismissed'],
            default: 'open',
        },
    },
    { timestamps: true }
);

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;
