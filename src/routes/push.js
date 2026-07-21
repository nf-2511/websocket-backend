const express = require('express');

const router = express.Router();

// Public VAPID key — safe to expose, the client needs it to create a PushSubscription.
router.get('/vapid-public-key', (req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY) return res.status(503).json({ message: 'Push not configured' });
    res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

module.exports = router;
