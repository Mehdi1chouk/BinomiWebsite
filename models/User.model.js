const mongoose = require('mongoose');

const Schema = mongoose.Schema({
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    age: { type: Number, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    gender: { type: String, required: true },
    governorate: { type: String, required: true },
    city: { type: String, required: true },
    profession: { type: String, required: true },
    workplace: { type: String, required: true },
    photo: { type: String, required: true },
    budget: { type: Number, required: false },
    preferences: {
        interests: { type: [String], default: [] },
        personality: { type: [String], default: [] },
        partyHabits: { type: [String], default: [] },
        smoking: { type: [String], default: [] },
        alcohol: { type: [String], default: [] },
        cleanliness: { type: [String], default: [] },
    },
    resetKey: String,
    resetTimeout: Number,
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String },
    tokenVersion: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
}, {
    timestamps: true
})

module.exports = mongoose.model('User', Schema)