const UserController = require('./controllers/user.Controller');
const RoomController = require('./controllers/room.Controller')
const authController = require('./controllers/auth.Controller')
const notifController = require('./controllers/notification.Controller')
const chatController = require('./controllers/chat.Controller')
const multiparty = require('connect-multiparty')
// Without a cap, connect-multiparty defaults to Infinity: a single large (or
// malicious) upload can fill the disk and take the server down for everyone.
const uploadmiddleware = multiparty({ uploadDir: './UsersImages', maxFilesSize: 10 * 1024 * 1024 }) // 10MB: one profile/verification photo
const uploadroomImages = multiparty({ uploadDir: './RoomImages', maxFilesSize: 50 * 1024 * 1024 }) // 50MB: a room listing's whole photo set
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
module.exports = (server) => {


    //users
    server.get('/users', verifytoken,UserController.getAll) 
    server.post('/users', uploadmiddleware, UserController.CreateUser)
    server.put('/users/:id',verifytoken,uploadmiddleware,UserController.updateUser)
    server.delete('/users/:id', verifytoken, UserController.deleteUser)
    server.patch('/users/:id/visibility', verifytoken, UserController.toggleVisibility)
    server.post('/users/filter', verifytoken, requireVerified, UserController.filterUser);
    server.get('/users/:id', verifytoken, UserController.getUserById);

    server.post('/report', verifytoken, reportController.reportUser);

    //photo verification
    server.post('/verify-face', verifytoken, uploadmiddleware, verificationController.verifyFace);

    //web push
    server.get('/push/public-key', pushController.getPublicKey);
    server.post('/push/subscribe', verifytoken, pushController.subscribe);
    server.post('/push/unsubscribe', verifytoken, pushController.unsubscribe);

    //admin
    server.get('/admin/reported-users', verifytoken, requireAdmin, adminController.getReportedUsers);
    server.get('/admin/reports/:userId', verifytoken, requireAdmin, adminController.getReportsForUser);
    server.post('/admin/users/:userId/alert', verifytoken, requireAdmin, adminController.sendAlert);
    server.post('/admin/users/:userId/ban', verifytoken, requireAdmin, adminController.banUser);
    server.post('/admin/users/:userId/unban', verifytoken, requireAdmin, adminController.unbanUser);
    server.get('/admin/users', verifytoken, requireAdmin, adminController.searchUsers);
    server.get('/admin/users/:userId/detail', verifytoken, requireAdmin, adminController.getUserDetail);
    server.patch('/admin/users/:userId/verification', verifytoken, requireAdmin, adminController.setVerification);
    server.get('/admin/rooms', verifytoken, requireAdmin, adminController.getListings);
    server.delete('/admin/rooms/:roomId', verifytoken, requireAdmin, adminController.removeListing);
    server.get('/admin/stats', verifytoken, requireAdmin, adminController.getDashboardStats);
    server.post('/admin/broadcast', verifytoken, requireAdmin, adminController.broadcast);
    server.get('/admin/audit-log', verifytoken, requireAdmin, adminController.getAuditLog);


    //auth
    server.post('/register', authFormLimiter, uploadmiddleware,authController.register)
    server.post('/login', loginLimiter, authController.login)
    server.post('/forgot-password', authFormLimiter, authController.forgotPassword)
    server.post('/reset-password', authFormLimiter, authController.resetPassword)
    server.put('/update-password/:userId', verifytoken,authController.updatePassword);


    //Room

    


    server.get('/room/encode/:id', (req, res) => {
    try {
        const encodedId = RoomController.encodeRoomId(req.params.id);
        res.json({ encodedId });
    } catch (error) {
        res.status(400).json({ message: 'Invalid room ID' });
    }
});


    server.get('/room', verifytoken, RoomController.getRoombyUserId)
    server.get('/Allrooms', RoomController.getAllRooms)
    server.post('/room', verifytoken, uploadroomImages, RoomController.CreateRoom)
    server.put('/room/:id',  verifytoken,uploadroomImages, RoomController.updateRoom)
    server.delete('/room/:id', verifytoken, RoomController.deleteRoom)
    server.get('/room/:id', verifytoken, requireVerified, RoomController.getRoomById);

    server.patch('/room/:id/incrementOccupants', RoomController.incrementOccupants);
    server.patch('/room/:id/decrementOccupants', RoomController.decrementOccupants);
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



    server.get('/filter', RoomController.filter)
    server.get('/search/:text', RoomController.search)
    server.get('/userRoom', RoomController.usersWithRoom)

    //notifications
    // For sending a notification
    server.post('/notif', verifytoken, requireVerified, notifController.sendNotification);
    server.post('/notif/binome', verifytoken, notifController.proposeBinome);
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