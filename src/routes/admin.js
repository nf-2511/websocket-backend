const express = require('express');
const User = require('../models/User');
const Report = require('../models/Report');
const Message = require('../models/Message');
const { requireAuth, requireAdmin } = require('../middleware/requireAdmin');
const { escapeRegex } = require('../utils/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/users', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 50;
    const search = (req.query.search || '').trim();
    const regex = search ? new RegExp(escapeRegex(search), 'i') : null;
    const filter = regex
        ? { $or: [{ firstName: regex }, { lastName: regex }, { email: regex }] }
        : {};
    const [users, total] = await Promise.all([
        User.find(filter).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        User.countDocuments(filter),
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
});

router.post('/users/:id/ban', async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, { banned: true }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'Not found' });
    res.json({ user });
});

router.post('/users/:id/unban', async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, { banned: false }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'Not found' });
    res.json({ user });
});

router.get('/reports', async (req, res) => {
    const status = req.query.status || 'open';
    const reports = await Report.find({ status })
        .populate('reporterId', 'firstName lastName email')
        .populate('targetUserId', 'firstName lastName email banned')
        .sort({ createdAt: -1 })
        .limit(100);
    res.json({ reports });
});

router.patch('/reports/:id', async (req, res) => {
    const { status } = req.body;
    if (!['open', 'reviewed', 'dismissed'].includes(status)) return res.status(400).json({ message: 'Bad status' });
    const report = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!report) return res.status(404).json({ message: 'Not found' });
    res.json({ report });
});

router.delete('/messages/:id', async (req, res) => {
    const message = await Message.findByIdAndUpdate(
        req.params.id,
        { deletedAt: new Date(), text: '', attachments: [] },
        { new: true }
    );
    if (!message) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true });
});

module.exports = router;
