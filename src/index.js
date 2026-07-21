const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

require('dotenv').config();
const connectDB = require('./config/database');
const { socketAuthMiddleware } = require('./middleware/socketAuth');
const { registerSocketHandlers } = require('./sockets');
const { UPLOAD_DIR } = require('./services/uploadService');
const uploadRoutes = require('./routes/upload');
const adminRoutes = require('./routes/admin');
const pushRoutes = require('./routes/push');

const app = express();
const server = http.createServer(app);

process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));

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

app.use(express.json());
app.use(cors({ origin: '*' }));
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'mars-chat-backend', rev: 6 });
});

app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/push', pushRoutes);

connectDB();

io.use(socketAuthMiddleware);
io.on('connection', (socket) => registerSocketHandlers(io, socket));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
