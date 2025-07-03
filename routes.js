const UserController = require('./controllers/user.Controller');
const RoomController = require('./controllers/room.Controller')
const authController = require('./controllers/auth.Controller')
const notifController = require('./controllers/notification.Controller')
const chatController = require('./controllers/chat.Controller')
const multiparty = require('connect-multiparty')
const uploadmiddleware = multiparty({ uploadDir: './UsersImages' })
const uploadroomImages = multiparty({ uploadDir: './RoomImages' })
const { verifytoken } = require('./middlewares/AuthMiddleWare')
const reportController = require('./controllers/report.Controller');
module.exports = (server) => {


    //users
    server.get('/users', verifytoken,UserController.getAll) 
    server.post('/users', uploadmiddleware, UserController.CreateUser)
    server.put('/users/:id',verifytoken,uploadmiddleware,UserController.updateUser)
    server.delete('/users/:id', UserController.deleteUser)
    server.post('/users/filter', verifytoken,UserController.filterUser);
    server.get('/users/:id', UserController.getUserById);

    server.post('/report', verifytoken, reportController.reportUser);


    //auth
    server.post('/register', uploadmiddleware,authController.register)
    server.post('/login', authController.login)
    server.post('/forgot-password', authController.forgotPassword)
    server.post('/reset-password', authController.resetPassword)
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
    server.delete('/room/:id', RoomController.deleteRoom)
    server.get('/room/:id', RoomController.getRoomById);
    
    server.patch('/room/:id/incrementOccupants', RoomController.incrementOccupants);
    server.patch('/room/:id/decrementOccupants', RoomController.decrementOccupants);
    server.put("/room/archive/:id",verifytoken,RoomController.archiveRoom);
    //server.get('/room/encoded/:encodedId', RoomController.getRoomByEncodedId);

    server.get('/room/current',verifytoken,RoomController.getCurrentUserRoom);
    // Increment current user's room occupants  
    server.patch('/room/current/increment',verifytoken,  RoomController.incrementCurrentUserOccupants);
    // Decrement current user's room occupants
    server.patch('/room/current/decrement', verifytoken,RoomController.decrementCurrentUserOccupants);
    // Archive current user's room
    server.put('/room/current/archive', verifytoken, RoomController.archiveCurrentUserRoom);



    server.get('/filter', RoomController.filter)
    server.get('/search/:text', RoomController.search)
    server.get('/userRoom', RoomController.usersWithRoom)

    //notifications
    // For sending a notification
    server.post('/notif', verifytoken, notifController.sendNotification);
    server.get('/notifications', verifytoken, notifController.getNotifications);
    server.post('/notifications/:notificationId/accept', verifytoken, notifController.acceptNotification);
    server.post('/notifications/:notificationId/refuse', verifytoken, notifController.refuseNotification);
    server.delete('/notifications/:notificationId', verifytoken,notifController.deleteNotification);


    // chat
    //server.post('/chat',verifytoken,chatController.sendMessage);
    server.get('/conversations', verifytoken, chatController.getConversations);
    server.get('/conversations/:conversationId/messages', verifytoken, chatController.getMessages);
    server.post('/conversations/:conversationId/messages', verifytoken, chatController.sendMessage);
    server.get('/messages/unread/count', verifytoken, chatController.getUnreadMessagesCount);
    server.patch('/conversations/:conversationId/read', verifytoken, chatController.markMessagesAsRead);




}