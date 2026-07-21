// Integration smoke tests against a running dev server (`npm run dev`). Creates and
// cleans up its own throwaway users so it can run against the real dev database.
const { io } = require('socket.io-client');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const ts = Date.now();

const connect = () => io(BASE_URL, { transports: ['websocket'], forceNew: true });

const waitFor = (socket, event, timeout = 8000) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeout);
        socket.once(event, (payload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });

describe('auth over socket.io', () => {
    const user = {
        email: `jest.${ts}@gmail.com`,
        password: 'password123',
        firstName: 'Jest',
        lastName: 'Runner',
        birthDate: '1990-01-01',
    };
    let socket;

    afterEach(() => {
        socket?.disconnect();
    });

    test('registers a new user and receives a JWT', async () => {
        socket = connect();
        await waitFor(socket, 'connect');
        socket.emit('auth:register', user);
        const result = await waitFor(socket, 'auth:success');
        expect(result.user.email).toBe(user.email);
        expect(typeof result.token).toBe('string');
        expect(result.token.length).toBeGreaterThan(10);
    });

    test('rejects a duplicate email on register', async () => {
        socket = connect();
        await waitFor(socket, 'connect');
        socket.emit('auth:register', user);
        const result = await waitFor(socket, 'auth:error');
        expect(result.message).toMatch(/already registered/i);
    });

    test('logs in with the correct password and rejects the wrong one', async () => {
        socket = connect();
        await waitFor(socket, 'connect');
        socket.emit('auth:login', { email: user.email, password: 'wrong-password' });
        const badResult = await waitFor(socket, 'auth:error');
        expect(badResult.message).toMatch(/wrong email or password/i);

        socket.emit('auth:login', { email: user.email, password: user.password });
        const goodResult = await waitFor(socket, 'auth:success');
        expect(goodResult.user.email).toBe(user.email);
    });

    test('non-gmail addresses are rejected', async () => {
        socket = connect();
        await waitFor(socket, 'connect');
        socket.emit('auth:register', { ...user, email: `jest.${ts}@outlook.com` });
        const result = await waitFor(socket, 'auth:error');
        expect(result.message).toMatch(/gmail/i);
    });

    afterAll(async () => {
        // Clean up the throwaway user created above.
        require('dotenv').config();
        const mongoose = require('mongoose');
        const User = require('../src/models/User');
        await mongoose.connect(process.env.MONGODB_URI);
        await User.deleteOne({ email: user.email });
        await mongoose.disconnect();
    });
});
