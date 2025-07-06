const mongoose = require('mongoose');

const Schema = mongoose.Schema({
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    age: { type: Number, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    gender: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    governorate: { type: String, required: true },
    city: { type: String, required: true },
    profession: { type: String, required: true },
    workplace: { type: String, required: true },
    photo: { type: String, required: true },
    budget: { type: Number, required: true },
    resetKey: String,
    resetTimeout: Number,
}, {
    timestamps: true
})

module.exports = mongoose.model('User', Schema)