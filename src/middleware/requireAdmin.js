const { verifyToken } = require('../services/tokenService');
const User = require('../models/User');

// REST middleware for /api/admin/* and /api/upload — verifies the Bearer JWT and,
// for admin routes, checks the user's role in the DB (not just the token's `role`
// claim, since a 30-day token could outlive a role change).
const requireAuth = async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const payload = token && verifyToken(token);
    if (!payload) return res.status(401).json({ message: 'Not authenticated' });
    req.userId = payload.sub;
    next();
};

const requireAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId).select('role banned');
        if (!user || user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
        req.adminUser = user;
        next();
    } catch (error) {
        console.error('requireAdmin error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { requireAuth, requireAdmin };
