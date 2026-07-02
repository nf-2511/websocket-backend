const crypto = require('crypto');
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const cors = require('cors');

require('dotenv').config();
const connectDB = require('./config/database');
const User = require('./models/User');
const { sendOTPEmail } = require('./services/emailService');

// WIFI
// 89.0.142.86 - MAN ( BACKEND ) // HTTP // LOCALHOST

// 237.84.2.178 - SHARIF (FRONTEND)
// 237.84.2.173 - Aziz (FRONT)
// 237.84.2.22 - Ali ( FRONT )

// In-memory OTP store: email -> { code, expiresAt, attempts }
const otpStore = new Map();
const OTP_MAX_ATTEMPTS = 5;

// Purge expired OTP entries so the map doesn't grow forever
setInterval(() => {
    const now = Date.now();
    for (const [email, record] of otpStore.entries()) {
        if (now > record.expiresAt) otpStore.delete(email);
    }
}, 60 * 1000);

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
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), test);
};

process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));

// userId -> socketId mapping for real-time DM notifications
const userSocketMap = new Map();

// cors websocket settings
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: false,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    upgradeTimeout: 10000,
    transports: ['polling', 'websocket'],
});

// SETTINGS
app.use(express.json());
app.use(cors({ origin: '*' }));

// Health check for Render / uptime monitors
app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'mars-chat-backend', rev: 4 });
});

// Connect to MongoDB
connectDB();

// socket.io
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Register user socket for real-time DM notifications
    socket.on('user:online', ({ userId } = {}) => {
        if (!userId) return;
        userSocketMap.set(String(userId), socket.id);
    });

    // Fetch current user's chats (populated)
    socket.on('user:get-chats', async ({ userId } = {}) => {
        if (!userId) { socket.emit('chats:list', []); return; }
        try {
            const user = await User.findById(userId).populate('chats', '_id firstName lastName email');
            // Own account must not appear in the chat list
            const chats = (user?.chats || []).filter((c) => String(c._id) !== String(userId));
            if (user && chats.length !== user.chats.length) {
                // lazy cleanup of self-references left by the old code
                User.updateOne({ _id: userId }, { $pull: { chats: userId } }).catch(() => {});
            }
            socket.emit('chats:list', chats);
        } catch (error) {
            console.error('user:get-chats error:', error);
            socket.emit('chats:list', []);
        }
    });

    // Check if email exists in DB
    socket.on('auth:check-email', async (payload) => {
        const email = normalizeEmail(payload?.email);
        if (!email || !email.endsWith('@gmail.com')) {
            socket.emit('auth:error', { message: 'Only @gmail.com emails are allowed' });
            return;
        }

        try {
            const user = await User.findOne({ email }).select('+password');

            if (user && user.password) {
                // Account uses password auth — no email needed
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
    });

    // Register new user
    // Register new user with a password — no email verification needed
    socket.on('auth:register', async ({ email, firstName, lastName, birthDate, password } = {}) => {
        email = normalizeEmail(email);
        if (!email.endsWith('@gmail.com')) {
            socket.emit('auth:error', { message: 'Only @gmail.com emails are allowed' });
            return;
        }
        if (!password || String(password).length < 6) {
            socket.emit('auth:error', { message: 'Password must be at least 6 characters' });
            return;
        }
        try {
            const newUser = new User({
                email,
                firstName,
                lastName,
                birthDate,
                password: hashPassword(String(password)),
            });
            await newUser.save();

            socket.emit('auth:success', {
                user: {
                    _id: newUser._id,
                    email: newUser.email,
                    firstName: newUser.firstName,
                    lastName: newUser.lastName,
                },
            });
        } catch (error) {
            console.error('auth:register error:', error);
            const message = error?.code === 11000 ? 'Email already registered' : 'Registration failed';
            socket.emit('auth:error', { message });
        }
    });

    // Login with email + password
    socket.on('auth:login', async ({ email, password } = {}) => {
        email = normalizeEmail(email);
        if (!email || !password) {
            socket.emit('auth:error', { message: 'Email and password are required' });
            return;
        }
        try {
            const user = await User.findOne({ email }).select('+password');
            if (!user || !user.password || !verifyPassword(String(password), user.password)) {
                socket.emit('auth:error', { message: 'Wrong email or password' });
                return;
            }
            socket.emit('auth:success', {
                user: {
                    _id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                },
            });
        } catch (error) {
            console.error('auth:login error:', error);
            socket.emit('auth:error', { message: 'Server error' });
        }
    });

    // Verify OTP code
    socket.on('auth:verify-otp', async (payload) => {
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
            otpStore.delete(email);

            socket.emit('auth:success', {
                user: {
                    _id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                },
            });
        } catch (error) {
            console.error('auth:verify-otp error:', error);
            socket.emit('auth:error', { message: 'Server error' });
        }
    });

    // Search users by name or email
    socket.on('users:search', async ({ query, userId } = {}) => {
        if (!query || query.trim().length < 1) {
            socket.emit('users:search-result', []);
            return;
        }
        try {
            const regex = new RegExp(escapeRegex(query.trim()), 'i');
            const filter = {
                $or: [
                    { firstName: regex },
                    { lastName: regex },
                    { email: regex },
                ],
            };
            if (userId) filter._id = { $ne: userId };
            const users = await User.find(filter).select('_id firstName lastName email age').limit(20);
            socket.emit('users:search-result', users);
        } catch (error) {
            console.error('users:search error:', error);
            socket.emit('users:search-result', []);
        }
    });

    // Send message to a room
    socket.on('message:send', async ({ roomId, text, senderId, receiverId } = {}) => {
        if (!roomId || !text) return;
        socket.to(roomId).emit('message:receive', {
            roomId,
            text,
            senderId,
            timestamp: new Date(),
        });

        if (senderId && receiverId && String(senderId) !== String(receiverId)) {
            try {
                await User.findByIdAndUpdate(senderId, { $addToSet: { chats: receiverId } });
                await User.findByIdAndUpdate(receiverId, { $addToSet: { chats: senderId } });

                const sender = await User.findById(senderId).select('_id firstName lastName email');
                const receiverSocketId = userSocketMap.get(String(receiverId));
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('chats:new-contact', sender);
                }
            } catch (error) {
                console.error('message:send chats update error:', error);
            }
        }
    });

    // Join a room
    socket.on('room:join', ({ roomId } = {}) => {
        if (!roomId) return;
        socket.join(roomId);
        console.log(`Socket ${socket.id} joined room: ${roomId}`);
    });

    // Leave a room (chat switch on the client)
    socket.on('room:leave', ({ roomId } = {}) => {
        if (!roomId) return;
        socket.leave(roomId);
    });

    socket.on('disconnect', () => {
        for (const [uid, sid] of userSocketMap.entries()) {
            if (sid === socket.id) { userSocketMap.delete(uid); break; }
        }
        console.log('User disconnected:', socket.id);
    });
});

// on  - habarni kutvolish
// emit - habar yuborish

// PORT
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
