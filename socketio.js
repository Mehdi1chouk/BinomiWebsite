const socketIO = require('socket.io');

let io; // Declare the io instance globally

module.exports = {
    init: (server) => {
        io = socketIO(server);
        console.log('Socket.IO initialized');

        io.on('connection', (client) => {
            console.log(`New client connected: ${client.id}`);

            // Get user ID and join room for targeted notifications
            client.on('register_user', (userId) => {
                client.join(userId); // Join a room with the user ID
                console.log(`User with ID ${userId} joined their room.`);
            });




            client.on('disconnect', () => {
                console.log(`Client disconnected: ${client.id}`);
            });
        });

        return io;
    },

    getIO: () => {
        if (!io) {
            console.error('Socket.IO not initialized!');
            throw new Error('Socket.IO not initialized!');
        }
        return io;
    }
};