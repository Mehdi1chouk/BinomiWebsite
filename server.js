const express = require('express')
const server = express()
server.use(express.json())
require('./routes')(server)
const dotenv = require('dotenv')
dotenv.config()
const mongoose = require('mongoose')

mongoose.connect(process.env.DB).
then(() => console.log('mongodb connected')).catch((err) => console.log('error connecting to', err))


server.get('/', (req, res) => {
    res.send('hello')
})


server.listen(process.env.PORT, () => { console.log('server connected on port 3003...') })