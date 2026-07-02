const mongoose = require('mongoose');

async function connectDB() {
    const MONGO_URL = process.env.MONGODB_URI;
    if (!MONGO_URL) {
        console.error('MONGODB_URI env var is not set');
        process.exit(1);
    }
    try {
        await mongoose.connect(MONGO_URL);
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
}

module.exports = connectDB;
