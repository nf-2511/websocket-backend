const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
    throw new Error('JWT_SECRET env var is not set');
}

const ACCESS_TOKEN_TTL = '30d';

const signToken = (user) =>
    jwt.sign({ sub: String(user._id), email: user.email, role: user.role || 'user' }, SECRET, {
        expiresIn: ACCESS_TOKEN_TTL,
    });

const verifyToken = (token) => {
    try {
        return jwt.verify(token, SECRET);
    } catch {
        return null;
    }
};

module.exports = { signToken, verifyToken };
