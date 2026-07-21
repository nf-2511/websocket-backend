const crypto = require('crypto');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const generateOTP = () => crypto.randomInt(10000, 100000);

const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
    const [salt, hash] = String(stored).split(':');
    if (!salt || !hash) return false;
    const test = crypto.scryptSync(password, salt, 64);
    const hashBuf = Buffer.from(hash, 'hex');
    if (hashBuf.length !== test.length) return false;
    return crypto.timingSafeEqual(hashBuf, test);
};

module.exports = { normalizeEmail, escapeRegex, generateOTP, hashPassword, verifyPassword };
