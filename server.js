const express = require('express');
const app = express();
const cors = require('cors')
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const http = require('http'); // For creating the HTTP server
const socketIO = require('./socketio'); // Import the Socket.IO configuration


app.use(express.json());
dotenv.config();
app.use(cors())

// Express setup


require('./routes')(app);

app.use('/UsersImages', express.static('UsersImages'));
app.use('/RoomImages', express.static('RoomImages'));
// HTTP Server setup
const server = http.createServer(app);

// Socket.IO initialization
const io = socketIO.init(server);






mongoose.connect(process.env.DB).
then(() => console.log('mongodb connected')).catch((err) => console.log('error connecting to', err))

// const serverr = require('http').createServer(app);
// const io = require('socket.io')(serverr);

// io.on('connection', (client) => {
//     console.log(`User connected: ${client._id}`);

//     client.on('user_logged_in', (firstname) => {
//         console.log(`${firstname} has logged in`);
//     });

//     client.on('disconnect', () => {
//         console.log(`User disconnected: ${client._id}`);
//     });
// });

server.listen(process.env.PORT, () => { console.log('server connected on port 3003...') })

// server.get('/', (req, res) => {
//     res.send('hello')
// })