const mongoose = require('mongoose');
const UserModel = require('../models/User.model');

const Schema = mongoose.Schema({

    type: String,
    etage: Number,
    assensceur: String,
    garage: String,
    etat: String,
    disponibilite: Date,
    region: String,
    ville: String,
    quartier: String,
    price: Number,
    cautionnement: Number,
    nombreDeColocation: Number,
    Equipement: [{
        path: String,
        name: String
    }],
    photos: [{
        path: String,
        size: Number,
        name: String
    }],
    description: String,
    gaz:Boolean,
    electricite :Boolean,
    chambres : Number,
    lits : Number,
    sdb : Number,
    user_id: { type: mongoose.Types.ObjectId, ref: UserModel }
})

module.exports = mongoose.model('Room', Schema)