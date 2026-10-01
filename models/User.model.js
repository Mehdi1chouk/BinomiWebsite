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
    // Separate from isVerified (that's the live face-match check). This
    // only confirms the email address itself is real and reachable — it
    // doesn't gate signup or login (see register()), just nudges the user
    // to confirm so password-reset/admin emails actually reach them.
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Number,
}, {
    timestamps: true
})

// Matches the exact filter shape both the browse feed (getAll) and the
// filter endpoint (filterUser) always query with first, before any of the
// optional criteria (governorate, gender, age, budget...) are layered on.
Schema.index({ role: 1, isBanned: 1, isVerified: 1 });

module.exports = mongoose.model('User', Schema)