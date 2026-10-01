const mongoose = require('mongoose');

const Schema = mongoose.Schema({
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    age: { type: Number, required: true },
    // unique: register already rejects a duplicate email with its own
    // findOne() check, but that check-then-insert has a race condition
    // (two concurrent signups with the same email could both pass it) —
    // this is the actual guarantee. It's also the field /login queries on
    // every single request, so it needs an index regardless.
    email: { type: String, required: true, unique: true },
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
    // Self-service "pause my search" — opt out of the browse feed and filter
    // results without deactivating the account. Only meaningful (and only
    // settable) for verified users; see toggleVisibility. Deliberately does
    // NOT affect getUserById, so existing chats/roommates/direct links still
    // work — this only hides someone from new discovery, not from people
    // who already found them.
    isHidden: { type: Boolean, default: false },
}, {
    timestamps: true
})

// Matches the exact filter shape both the browse feed (getAll) and the
// filter endpoint (filterUser) always query with first, before any of the
// optional criteria (governorate, gender, age, budget...) are layered on.
Schema.index({ role: 1, isBanned: 1, isVerified: 1, isHidden: 1 });

module.exports = mongoose.model('User', Schema)