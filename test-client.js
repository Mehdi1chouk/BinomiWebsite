const io = require('socket.io-client');

// Connect to the Socket.IO server
const socket = io('http://localhost:3003'); // Replace with your server URL

const receiverUserId = 'receiver_user_id_here'; // Make sure it matches the server
socket.on('connect', () => {
    console.log('Client connected to the server');

    // Register the user ID as a room
    //socket.emit('register_user', receiverUserId);
});

socket.on('user_connected', (data) => {
    console.log('user : ', data);
});

// Listen for notifications
socket.on('receive_notification', (data) => {
    console.log('Notification received:', data);
});


socket.on('receive_chatMessage', (data) => {
    console.log('message received:', data);
});

// Handle disconnect
socket.on('disconnect', () => {
    console.log('Client disconnected');
});