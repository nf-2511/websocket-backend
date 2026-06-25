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

// In-memory OTP store: email -> { code, expiresAt }
const otpStore = new Map();

// cors websocket settings
const io = new Server(server, {
    cors: {
        origin: '*',
    },
});

// SETTINGS
app.use(express.json());
app.use(cors());

// Connect to MongoDB
connectDB();

// socket.io
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Check if email exists in DB
    socket.on('auth:check-email', async ({ email }) => {
        if (!email || !email.endsWith('@gmail.com')) {
            socket.emit('auth:error', { message: 'Only @gmail.com emails are allowed' });
            return;
        }

        try {
            const user = await User.findOne({ email });

            if (user) {
                const code = Math.floor(10000 + Math.random() * 90000);
                const expiresAt = Date.now() + 5 * 60 * 1000;
                otpStore.set(email, { code, expiresAt });

                await sendOTPEmail(email, code);
                socket.emit('auth:otp-sent', { message: 'Code sent to your email' });
            } else {
                socket.emit('auth:register-required');
            }
        } catch (error) {
            console.error('auth:check-email error:', error);
            socket.emit('auth:error', { message: 'Server error' });
        }
    });

    // Register new user
    socket.on('auth:register', async ({ email, firstName, lastName, birthDate }) => {
        try {
            const newUser = new User({ email, firstName, lastName, birthDate });
            await newUser.save();

            const code = Math.floor(10000 + Math.random() * 90000);
            const expiresAt = Date.now() + 5 * 60 * 1000;
            otpStore.set(email, { code, expiresAt });

            await sendOTPEmail(email, code);
            socket.emit('auth:otp-sent', { message: 'Account created! Code sent' });
        } catch (error) {
            console.error('auth:register error:', error);
            socket.emit('auth:error', { message: 'Registration failed' });
        }
    });

    // Verify OTP code
    socket.on('auth:verify-otp', async ({ email, code }) => {
        const record = otpStore.get(email);

        if (!record || Date.now() > record.expiresAt) {
            socket.emit('auth:error', { message: 'Code expired or invalid' });
            return;
        }

        if (String(record.code) !== String(code)) {
            socket.emit('auth:error', { message: 'Wrong code' });
            return;
        }

        try {
            const user = await User.findOne({ email });
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

    // Send message to a room
    socket.on('message:send', ({ roomId, text, senderId }) => {
        socket.to(roomId).emit('message:receive', {
            text,
            senderId,
            timestamp: new Date(),
        });
    });

    // Join a room
    socket.on('room:join', ({ roomId }) => {
        socket.join(roomId);
        console.log(`Socket ${socket.id} joined room: ${roomId}`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// on  - habarni kutvolish
// emit - habar yuborish

// PORT
server.listen(5000, () => {
    console.log('Server is running on port 5000');
});
