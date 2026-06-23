const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const cors = require('cors');

// WIFI
// 89.0.142.86 - MAN ( BACKEND ) // HTTP // LOCALHOST

// 237.84.2.178 - SHARIF (FRONTEND)
// 237.84.2.173 - Aziz (FRONT)
// 237.84.2.22 - Ali ( FRONT )

// cors websocket settings
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

// SETTINGS
app.use(express.json());
app.use(cors())


// API 

// login / register API


// socket.io
io.on("connection", (socket) => {
    console.log("Connected to socket.io");

    console.log("user connacted: ", socket.id);

    socket.emit('message', 'Hush kelibsiz')
})

// on - habarni kutvolish
// emit - habar yuborish

// PORT
app.listen(5000, () => {
    console.log("Server is running on port 5000");
})




