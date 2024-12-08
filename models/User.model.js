const mongoose = require('mongoose');

const Schema = mongoose.Schema({

    firstname: String,
    lastname: String,
    dateOfBirth: Date,
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
    resetKey: String


})

module.exports = mongoose.model('User', Schema)