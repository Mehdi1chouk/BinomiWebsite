const express = require('express');
const app = express();
const cors = require('cors')
const morgan = require('morgan');
const dotenv = require('dotenv');
dotenv.config();
const mongoose = require('mongoose');
const http = require('http'); // For creating the HTTP server
const socketIO = require('./socketio'); // Import the Socket.IO configuration

// Without this there was no record at all of what requests the server was
// getting — a user reporting "it froze" was unverifiable. Logs every
// request's method/path/status/timing, first so it catches everything
// (including ones later middleware rejects, e.g. a CORS block or a
// rate-limit 429), not just the ones that reach a route.
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// cors() with no options reflects any origin — anyone could call this API
// from any website. Restricted to the same allowlist Socket.IO already uses.
const allowedOrigins = (process.env.CLIENT_URLS || 'http://localhost:5173,http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim());

app.use(express.json());
app.use(cors({
    origin: (origin, callback) => {
        // No Origin header means a non-browser client (curl, a mobile app,
        // server-to-server) — nothing to check against, so let it through.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        const error = new Error('Not allowed by CORS');
        error.status = 403;
        callback(error);
    }
}))
// Express setup
require('./routes')(app);

app.use('/UsersImages', express.static('UsersImages'));
app.use('/RoomImages', express.static('RoomImages'));

// Catches errors passed via next(err) — in particular connect-multiparty
// rejecting an upload that exceeds maxFilesSize — and responds with JSON
// instead of Express's default HTML error page, which the frontend can't parse.
app.use((err, req, res, next) => {
    if (err.code === 'ETOOBIG') {
        return res.status(400).json({ message: 'Le fichier est trop volumineux.' });
    }
    console.error(err);
    res.status(err.status || err.statusCode || 500).json({ message: err.message || 'Une erreur est survenue.' });
});
// HTTP Server setup
const server = http.createServer(app);

// A promise rejection with nothing to catch it currently crashes the whole
// process for every connected user (Node's default since v15), over what's
// usually a bug in a single request. Log it and keep serving everyone else.
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

// A truly uncaught synchronous throw means the process may be in a broken
// state — Node's own docs say not to resume normal operation after one.
// Log it, stop accepting new connections, let in-flight requests finish,
// then exit so a process manager (nodemon in dev, pm2/the host in prod)
// can restart clean instead of the process silently wedging.
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    server.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 10000).unref();
});

// Socket.IO initialization
const io = socketIO.init(server);


mongoose.connect(process.env.DB).
then(() => console.log('mongodb connected')).catch((err) => console.log('error connecting to', err))



server.listen(process.env.PORT, () => { console.log('server connected on port 3003...') })

