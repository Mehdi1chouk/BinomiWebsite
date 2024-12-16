const UserController = require('./controllers/user.Controller');
const RoomController = require('./controllers/room.Controller')
const authController = require('./controllers/auth.Controller')
const multiparty = require('connect-multiparty')
const uploadmiddleware = multiparty({ uploadDir: './UsersImages' })
const uploadroomImages = multiparty({ uploadDir: './RoomImages' })
const { verifytoken } = require('./middlewares/AuthMiddleWare')



module.exports = (server) => {



    //users
    server.get('/users', UserController.getAll) // a changer all users should be shown only when authenticated(token)
    server.post('/users', uploadmiddleware, UserController.CreateUser)
    server.put('/users/:id', UserController.updateUser)
    server.delete('/users/:id', UserController.deleteUser)
    server.post('/users/filter', UserController.filterUser);

    //auth
    server.post('/register', authController.register)
    server.post('/login', authController.login)
    server.post('/forgot-password', authController.forgotPassword)
    server.post('/reset-password', authController.resetPassword)

    //Room
    server.get('/room', verifytoken, RoomController.getRoombyUserId)
    server.get('/Allrooms', RoomController.getAllRooms)
    server.post('/room', verifytoken, uploadroomImages, RoomController.CreateRoom)
    server.put('/room/:id', uploadroomImages, RoomController.updateRoom)
    server.delete('/room/:id', RoomController.deleteRoom)

    server.get('/filter', RoomController.filter)
    server.get('/search/:text', RoomController.search)
    server.get('/userRoom', RoomController.usersWithRoom)


}