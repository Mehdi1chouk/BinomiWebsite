const mongoose = require('mongoose');

const Schema = mongoose.Schema({

    firstname: String,
    lastname: String,
    age: Number,
    email: { type: String, required: true },
    password: String,
    gender: { type: String, required: true },
    phoneNumber: String,
    governorate: String,
    city: String,
    profession: String,
    workplace: String,
    photo: String,
    budget: Number,
    resetKey: String,
    resetTimeout: Number,
    
 
}, {
    timestamps: true
})

module.exports = mongoose.model('User', Schema)