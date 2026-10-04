const UserController = require('./controllers/user.Controller');
const RoomController = require('./controllers/room.Controller')
const authController = require('./controllers/auth.Controller')
const notifController = require('./controllers/notification.Controller')
const chatController = require('./controllers/chat.Controller')
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// connect-multiparty is unmaintained with an open, unpatched "arbitrary file
// upload" advisory (GHSA-w2xw-44r3-4v9g) — multer is the actively maintained
// equivalent. Generates its own random filename (multer's default drops the
// extension entirely, which would break anything downstream that assumes
// one, like compressImage's `.jpg` swap).
const randomFilename = (file) => `${uuidv4()}${path.extname(file.originalname)}`;

const usersImagesStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './UsersImages'),
    filename: (req, file, cb) => cb(null, randomFilename(file))
});
const roomImagesStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './RoomImages'),
    filename: (req, file, cb) => cb(null, randomFilename(file))
});

// One profile/verification photo — 10MB.
const uploadmiddleware = multer({ storage: usersImagesStorage, limits: { fileSize: 10 * 1024 * 1024 } });
// A room listing's whole photo set — 50MB per photo, capped at 10 photos so
// the per-request total stays bounded (connect-multiparty's maxFilesSize was
// a 50MB TOTAL cap; multer's fileSize is per-file, so the count cap is what
// keeps the worst case from growing unbounded).
const uploadroomImages = multer({ storage: roomImagesStorage, limits: { fileSize: 50 * 1024 * 1024, files: 10 } });
const { verifytoken, requireAdmin, requireVerified } = require('./middlewares/AuthMiddleWare')
const reportController = require('./controllers/report.Controller');
const adminController = require('./controllers/admin.Controller');
const verificationController = require('./controllers/verification.Controller');
const pushController = require('./controllers/push.Controller');
const rateLimit = require('express-rate-limit');

// Without these, /login is wide open to brute-forcing passwords, and
// /register + /forgot-password can be hammered to spam signups or flood a
// victim's inbox with reset emails.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' }
});
const authFormLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de tentatives. Réessayez dans quelques minutes.' }
});
// /verify-face proxies every call to the Flask CLIP/facenet service — each
// one is real CPU cost there, and without a cap an authenticated-but-stuck
// liveness flow (or a scripted abuse attempt) could hammer it indefinitely.
// Higher than authFormLimiter since a genuine user may need several retries
// to get a good angle/lighting during the actual liveness challenge.
const verifyFaceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de tentatives de vérification. Réessayez dans quelques minutes.' }
});
module.exports = (server) => {


    //users
    server.get('/users', verifytoken,UserController.getAll)
    server.put('/users/:id',verifytoken,uploadmiddleware.single('photo'),UserController.updateUser)
    server.delete('/users/:id', verifytoken, UserController.deleteUser)
    server.patch('/users/:id/visibility', verifytoken, UserController.toggleVisibility)
    server.post('/users/filter', verifytoken, requireVerified, UserController.filterUser);
    server.get('/users/:id', verifytoken, UserController.getUserById);

    server.post('/report', verifytoken, requireVerified, authFormLimiter, reportController.reportUser);

    //photo verification
    server.post('/verify-face', verifytoken, verifyFaceLimiter, uploadmiddleware.single('live'), verificationController.verifyFace);

    //web push
    server.get('/push/public-key', pushController.getPublicKey);
    server.post('/push/subscribe', verifytoken, authFormLimiter, pushController.subscribe);
    server.post('/push/unsubscribe', verifytoken, pushController.unsubscribe);

    //admin
    server.get('/admin/reported-users', verifytoken, requireAdmin, adminController.getReportedUsers);
    server.get('/admin/reports/:userId', verifytoken, requireAdmin, adminController.getReportsForUser);
    server.post('/admin/users/:userId/alert', verifytoken, requireAdmin, adminController.sendAlert);
    server.post('/admin/users/:userId/ban', verifytoken, requireAdmin, adminController.banUser);
    server.post('/admin/users/:userId/unban', verifytoken, requireAdmin, adminController.unbanUser);
    server.delete('/admin/users/:userId', verifytoken, requireAdmin, adminController.deleteUser);
    server.get('/admin/users', verifytoken, requireAdmin, adminController.searchUsers);
    server.get('/admin/users/:userId/detail', verifytoken, requireAdmin, adminController.getUserDetail);
    server.patch('/admin/users/:userId/verification', verifytoken, requireAdmin, adminController.setVerification);
    server.get('/admin/rooms', verifytoken, requireAdmin, adminController.getListings);
    server.delete('/admin/rooms/:roomId', verifytoken, requireAdmin, adminController.removeListing);
    server.get('/admin/stats', verifytoken, requireAdmin, adminController.getDashboardStats);
    server.post('/admin/broadcast', verifytoken, requireAdmin, adminController.broadcast);
    server.get('/admin/audit-log', verifytoken, requireAdmin, adminController.getAuditLog);


    //auth
    server.post('/register', authFormLimiter, uploadmiddleware.single('photo'),authController.register)
    server.post('/login', loginLimiter, authController.login)
    server.post('/forgot-password', authFormLimiter, authController.forgotPassword)
    server.post('/reset-password', authFormLimiter, authController.resetPassword)
    server.put('/update-password/:userId', verifytoken, authFormLimiter, authController.updatePassword);


    //Room

    


    server.get('/room/encode/:id', verifytoken, (req, res) => {
    try {
        const encodedId = RoomController.encodeRoomId(req.params.id);
        res.json({ encodedId });
    } catch (error) {
        res.status(400).json({ message: 'Invalid room ID' });
    }
});


    server.get('/room', verifytoken, RoomController.getRoombyUserId)
    server.get('/Allrooms', verifytoken, RoomController.getAllRooms)
    server.post('/room', verifytoken, requireVerified, uploadroomImages.array('photos', 10), RoomController.CreateRoom)
    server.put('/room/:id',  verifytoken,requireVerified,uploadroomImages.array('photos', 10), RoomController.updateRoom)
    server.delete('/room/:id', verifytoken, RoomController.deleteRoom)
    server.get('/room/:id', verifytoken, requireVerified, RoomController.getRoomById);

    server.put("/room/archive/:id",verifytoken,RoomController.archiveRoom);
    server.put('/room/:id/reactivate', verifytoken, RoomController.reactivateRoom);
    //server.get('/room/encoded/:encodedId', RoomController.getRoomByEncodedId);

    server.get('/room/current',verifytoken,RoomController.getCurrentUserRoom);
    // Increment current user's room occupants  
    server.patch('/room/current/increment',verifytoken,  RoomController.incrementCurrentUserOccupants);
    // Decrement current user's room occupants
    server.patch('/room/current/decrement', verifytoken,RoomController.decrementCurrentUserOccupants);
    // Archive current user's room
    server.put('/room/current/archive', verifytoken, RoomController.archiveCurrentUserRoom);
    // What binome button to show for a given other user (propose / pending / already binome)
    server.get('/room/binome-status/:otherUserId', verifytoken, RoomController.getBinomeStatus);



    //notifications
    // For sending a notification
    server.post('/notif', verifytoken, requireVerified, notifController.sendNotification);
    server.post('/notif/binome', verifytoken, requireVerified, notifController.proposeBinome);
    server.get('/notifications', verifytoken, notifController.getNotifications);
    server.get('/notifications/unread-count', verifytoken, notifController.getUnreadNotificationsCount);
    server.post('/notifications/mark-all-read', verifytoken, notifController.markAllNotificationsAsRead);
    server.post('/notifications/:notificationId/accept', verifytoken, notifController.acceptNotification);
    server.post('/notifications/:notificationId/refuse', verifytoken, notifController.refuseNotification);
    server.delete('/notifications/:notificationId', verifytoken,notifController.deleteNotification);

    server.get('/notifications/check-status', verifytoken, notifController.checkNotificationStatus);
    server.get('/conversations/check-existing', verifytoken, notifController.checkExistingConversation);


    // chat
    //server.post('/chat',verifytoken,chatController.sendMessage);
    server.get('/conversations', verifytoken, chatController.getConversations);
    server.get('/conversations/:conversationId/messages', verifytoken, chatController.getMessages);
    server.post('/conversations/:conversationId/messages', verifytoken, requireVerified, chatController.sendMessage);
    server.get('/messages/unread/count', verifytoken, chatController.getUnreadMessagesCount);
    server.patch('/conversations/:conversationId/read', verifytoken, chatController.markMessagesAsRead);




}