const express = require('express');
const { upload } = require('../services/uploadService');
const { requireAuth } = require('../middleware/requireAdmin');

const router = express.Router();

// Binary uploads go over plain HTTP (multipart), not Socket.IO — the client then sends
// the returned URL as a Message.attachments entry via the message:send socket event.
router.post('/', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    res.json({
        url: `/uploads/${req.file.filename}`,
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
    });
});

// multer errors (bad mime type, file too large) land here instead of the handler above.
router.use((err, req, res, next) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed' });
    next();
});

module.exports = router;
