const mongoose = require('mongoose');

const MONGO_URL = 'mongodb+srv://Bekzod:6862442@cluster0.vssewsn.mongodb.net/chat?appName=Cluster0';

async function connectDB() {
    try {
        await mongoose.connect(MONGO_URL);
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
}

module.exports = connectDB;
