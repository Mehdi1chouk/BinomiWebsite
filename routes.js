const UserController = require('./controllers/user.Controller');
const RoomController = require('./controllers/room.Controller')
const authController = require('./controllers/auth.Controller')
const notifController = require('./controllers/notification.Controller')
const chatController = require('./controllers/chat.Controller')
const multiparty = require('connect-multiparty')
const uploadmiddleware = multiparty({ uploadDir: './UsersImages' })
const uploadroomImages = multiparty({ uploadDir: './RoomImages' })
const { verifytoken } = require('./middlewares/AuthMiddleWare')

module.exports = (server) => {


    //users
    server.get('/users', verifytoken,UserController.getAll) // a changer all users should be shown only when authenticated(token)
    server.post('/users', uploadmiddleware, UserController.CreateUser)
    server.put('/users/:id',verifytoken,uploadmiddleware,UserController.updateUser)
    server.delete('/users/:id', UserController.deleteUser)
    server.post('/users/filter', UserController.filterUser);
    server.get('/users/:id', UserController.getUserById);


    //auth
    server.post('/register', uploadmiddleware,authController.register)
    server.post('/login', authController.login)
    server.post('/forgot-password', authController.forgotPassword)
    server.post('/reset-password', authController.resetPassword)

    //Room
    server.get('/room', verifytoken, RoomController.getRoombyUserId)
    server.get('/Allrooms', RoomController.getAllRooms)
    server.post('/room', verifytoken, uploadroomImages, RoomController.CreateRoom)
    server.put('/room/:id',  verifytoken,uploadroomImages, RoomController.updateRoom)
    server.delete('/room/:id', RoomController.deleteRoom)
    server.get('/room/:id', RoomController.getRoomById);


    server.get('/filter', RoomController.filter)
    server.get('/search/:text', RoomController.search)
    server.get('/userRoom', RoomController.usersWithRoom)

    //notifications
    // For sending a notification
    server.post('/notif', verifytoken, notifController.sendNotification);

    // For fetching notifications for the current user
    server.get('/notifications', verifytoken, notifController.getNotifications);

    // For handling notification actions (accept/reject)
    server.post('/notifications/:notificationId/accept', verifytoken, notifController.acceptNotification);
    server.post('/notifications/:notificationId/refuse', verifytoken, notifController.refuseNotification);
    // chat
    //server.post('/chat',verifytoken,chatController.sendMessage);
    server.get('/conversations', verifytoken, chatController.getConversations);
    server.get('/conversations/:conversationId/messages', verifytoken, chatController.getMessages);
    server.post('/conversations/:conversationId/messages', verifytoken, chatController.sendMessage);


}