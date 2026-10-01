const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

let io; // Declare the io instance globally

module.exports = {
    init: (server) => {
        // Hardcoding the dev URLs here meant real-time chat would silently
        // stop working the moment this is deployed to an actual domain —
        // driven by CLIENT_URLS so prod just needs the env var set.
        const allowedOrigins = (process.env.CLIENT_URLS || "http://localhost:5173,http://localhost:4200")
            .split(',')
            .map((origin) => origin.trim());

        io = new Server(server, {
            cors: {
                origin: allowedOrigins,
                methods: ["GET", "POST"],
                allowedHeaders: ["Authorization"],
                credentials: true
            }
        });
        console.log('Socket.IO initialized');

        // Each user joins a room named after their own id (see register_user
        // below), and every targeted emit elsewhere in the app does
        // `io.to(userId).emit(...)`. Without this adapter, that room
        // membership only exists in THIS process's memory — running more
        // than one server instance (needed once traffic outgrows one
        // process) would silently drop messages for any sender/receiver pair
        // split across two different instances. The adapter makes every
        // instance publish/subscribe room events through Redis instead, so
        // it behaves the same with 1 instance or 10.
        // Entirely optional and additive: no REDIS_URL means no adapter at
        // all, and everything behaves exactly as it always has — this never
        // becomes a required dependency for local dev or a single-instance
        // deploy, and a Redis hiccup at boot degrades to single-instance
        // behavior rather than crashing the server.
        if (process.env.REDIS_URL) {
            const pubClient = createClient({ url: process.env.REDIS_URL });
            const subClient = pubClient.duplicate();

            pubClient.on('error', (err) => console.error('Redis (pub) error:', err.message));
            subClient.on('error', (err) => console.error('Redis (sub) error:', err.message));

            Promise.all([pubClient.connect(), subClient.connect()])
                .then(() => {
                    io.adapter(createAdapter(pubClient, subClient));
                    console.log('Socket.IO Redis adapter connected — ready to run across multiple instances.');
                })
                .catch((err) => {
                    console.error('Socket.IO Redis adapter failed to connect, continuing in single-instance mode:', err.message);
                });
        }

        io.on('connection', (client) => {
            console.log(`New client connected: ${client.id}`);

            // Get user ID and join room for targeted notifications
            client.on('register_user', (userId) => {
                client.join(userId); // Join a room with the user ID
                console.log(`User ${userId} registered to room`);
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