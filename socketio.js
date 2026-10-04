const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const jwt = require('jsonwebtoken');

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

        // Without this, any bare socket.io-client (no browser needed, so the
        // CORS origin check above doesn't even apply) could call
        // register_user('<any id>') and silently receive that user's private
        // chat messages and notifications forever — user ids aren't secret,
        // they're returned in plain API responses. The handshake is now
        // authenticated the same way REST requests are: a valid JWT,
        // verified server-side, determines which room this socket can ever
        // join — never a value the client supplies directly (see the
        // 'connection' handler below, which joins socket.data.userId, not
        // anything from a register_user event).
        io.use((socket, next) => {
            const token = socket.handshake.auth?.token;
            if (!token) return next(new Error('Authentication required'));
            try {
                const decoded = jwt.verify(token, process.env.SECRET);
                socket.data.userId = decoded._id;
                next();
            } catch (err) {
                next(new Error('Invalid token'));
            }
        });

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

            // Joins the room the verified JWT says this socket belongs to —
            // never a client-supplied id. Fires here rather than on a
            // register_user event because 'connection' re-runs on every
            // reconnect too (each reconnect is a fresh connection), so there
            // only being a single join point also closes the old gap where
            // a reconnect could leave a socket connected but never rejoined.
            client.join(client.data.userId);
            console.log(`User ${client.data.userId} joined their room`);

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