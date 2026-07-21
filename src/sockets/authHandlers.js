const User = require('../models/User');
const { sendOTPEmail } = require('../services/emailService');
const { signToken } = require('../services/tokenService');
const { normalizeEmail, generateOTP, hashPassword, verifyPassword } = require('../utils/auth');
const { otpStore, OTP_MAX_ATTEMPTS } = require('../state/otpStore');
const { rateLimited } = require('../utils/rateLimiter');

const publicUser = (user) => ({
    _id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    publicKey: user.publicKey,
});

const succeed = (socket, user) => {
    socket.userId = String(user._id);
    socket.userRole = user.role;
    socket.emit('auth:success', { user: publicUser(user), token: signToken(user) });
};

const registerAuthHandlers = (io, socket) => {
    // Per-socket sliding-window limits: slows credential stuffing / OTP spam on one
    // connection. An attacker can still reconnect for a fresh bucket — an IP-keyed
    // limiter would close that, but needs shared state; out of scope for now.
    socket.on('auth:check-email', rateLimited(socket, 'auth:check-email', { max: 3, windowMs: 60000 }, async (payload) => {
        const email = normalizeEmail(payload?.email);
        if (!email || !email.endsWith('@gmail.com')) {
            socket.emit('auth:error', { message: 'Only @gmail.com emails are allowed' });
            return;
        }
        try {
            const user = await User.findOne({ email }).select('+password');
            if (user && user.password) {
                socket.emit('auth:password-required');
            } else if (user) {
                const code = generateOTP();
                const expiresAt = Date.now() + 5 * 60 * 1000;
                otpStore.set(email, { code, expiresAt, attempts: 0 });
                console.log(`[OTP] Code generated for ${email}`);
                try {
                    await sendOTPEmail(email, code);
                    socket.emit('auth:otp-sent', { message: 'Code sent to your email' });
                } catch (err) {
                    console.error('[OTP] Email send failed:', err);
                    otpStore.delete(email);
                    socket.emit('auth:error', { message: `Email delivery failed: ${err.message}` });
                }
            } else {
                socket.emit('auth:register-required');
            }
        } catch (error) {
            console.error('auth:check-email error:', error);
            socket.emit('auth:error', { message: 'Server error' });
        }
    }));

    socket.on('auth:register', rateLimited(socket, 'auth:register', { max: 3, windowMs: 60000 }, async ({ email, firstName, lastName, birthDate, password } = {}) => {
        const normEmail = normalizeEmail(email);
        if (!normEmail.endsWith('@gmail.com')) {
            socket.emit('auth:error', { message: 'Only @gmail.com emails are allowed' });
            return;
        }
        if (!password || String(password).length < 6) {
            socket.emit('auth:error', { message: 'Password must be at least 6 characters' });
            return;
        }
        try {
            const newUser = new User({
                email: normEmail,
                firstName,
                lastName,
                birthDate,
                password: hashPassword(String(password)),
            });
            await newUser.save();
            succeed(socket, newUser);
        } catch (error) {
            console.error('auth:register error:', error);
            const message = error?.code === 11000 ? 'Email already registered' : 'Registration failed';
            socket.emit('auth:error', { message });
        }
    }));

    socket.on('auth:login', rateLimited(socket, 'auth:login', { max: 5, windowMs: 60000 }, async ({ email, password } = {}) => {
        const normEmail = normalizeEmail(email);
        if (!normEmail || !password) {
            socket.emit('auth:error', { message: 'Email and password are required' });
            return;
        }
        try {
            const user = await User.findOne({ email: normEmail }).select('+password');
            if (!user || !user.password || !verifyPassword(String(password), user.password)) {
                socket.emit('auth:error', { message: 'Wrong email or password' });
                return;
            }
            if (user.banned) {
                socket.emit('auth:error', { message: 'This account has been banned' });
                return;
            }
            succeed(socket, user);
        } catch (error) {
            console.error('auth:login error:', error);
            socket.emit('auth:error', { message: 'Server error' });
        }
    }));

    socket.on('auth:verify-otp', rateLimited(socket, 'auth:verify-otp', { max: 10, windowMs: 60000 }, async (payload) => {
        const email = normalizeEmail(payload?.email);
        const code = payload?.code;
        const record = otpStore.get(email);

        if (!record || Date.now() > record.expiresAt) {
            otpStore.delete(email);
            socket.emit('auth:error', { message: 'Code expired or invalid' });
            return;
        }
        if (String(record.code) !== String(code).trim()) {
            record.attempts += 1;
            if (record.attempts >= OTP_MAX_ATTEMPTS) {
                otpStore.delete(email);
                socket.emit('auth:error', { message: 'Too many wrong attempts. Request a new code' });
                return;
            }
            socket.emit('auth:error', { message: 'Wrong code' });
            return;
        }
        try {
            const user = await User.findOne({ email });
            if (!user) {
                socket.emit('auth:error', { message: 'User not found. Please register' });
                return;
            }
            if (user.banned) {
                socket.emit('auth:error', { message: 'This account has been banned' });
                return;
            }
            otpStore.delete(email);
            succeed(socket, user);
        } catch (error) {
            console.error('auth:verify-otp error:', error);
            socket.emit('auth:error', { message: 'Server error' });
        }
    }));

    // Client publishes its ECDH public key (base64 SPKI) for E2E-encrypted DMs.
    socket.on('keys:publish', async ({ publicKey } = {}) => {
        if (!socket.userId || !publicKey) return;
        try {
            await User.findByIdAndUpdate(socket.userId, { publicKey });
        } catch (error) {
            console.error('keys:publish error:', error);
        }
    });

    socket.on('keys:get', async ({ userId } = {}, ack) => {
        if (!socket.userId || !userId) return typeof ack === 'function' && ack(null);
        try {
            const user = await User.findById(userId).select('publicKey');
            if (typeof ack === 'function') ack(user?.publicKey || null);
        } catch (error) {
            console.error('keys:get error:', error);
            if (typeof ack === 'function') ack(null);
        }
    });
};

module.exports = { registerAuthHandlers, publicUser };
