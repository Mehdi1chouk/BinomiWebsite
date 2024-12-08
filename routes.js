const UserController = require('./controllers/user.Controller');
const RoomController = require('./controllers/room.Controller')
const authController = require('./controllers/auth.Controller')
const multiparty = require('connect-multiparty')
const uploadmiddleware = multiparty({ uploadDir: './UsersImages' })
const uploadroomImages = multiparty({ uploadDir: './RoomImages' })
const { verifytoken } = require('./middlewares/AuthMiddleWare')



module.exports = (server) => {



    //users
    server.get('/users', UserController.getAll) // /users lel api lkol more professional w hana l api tetbadel wkhw get,post...
    server.post('/users', uploadmiddleware, UserController.CreateUser)
    server.put('/users/:id', UserController.updateUser)
    server.delete('/users/:id', UserController.deleteUser)

    //auth
    server.post('/register', authController.register)
    server.post('/login', authController.login)
    server.post('/forgot-password', authController.forgotPassword)
    server.post('/reset-password', authController.resetPassword)

    //Room
    server.get('/room', verifytoken, RoomController.getAll)
    server.get('/Allrooms', RoomController.getAllRooms)
    server.post('/room', verifytoken, uploadroomImages, RoomController.CreateRoom)
    server.put('/room/:id', uploadroomImages, RoomController.updateRoom)
    server.delete('/room/:id', RoomController.deleteRoom)



}