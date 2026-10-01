// const mongoose = require('mongoose');
// const UserModel = require('../models/User.model');

// const Schema = mongoose.Schema({

//     type: String,
//     etage: Number,
//     assensceur: String,
//     garage: String,
//     etat: String,
//     disponibilite: Date,
//     region: String,
//     ville: String,
//     quartier: String,
//     price: Number,
//     cautionnement: Number,
//     nombreDeColocation: Number,
//     Equipement: [{
//         path: String,
//         name: String
//     }],
//     photos: [{
//         path: String,
//         size: Number,
//         name: String
//     }],
//     description: String,
//     gaz:Boolean,
//     electricite :Boolean,
//     chambres : Number,
//     lits : Number,
//     sdb : Number,
//     user_id: { type: mongoose.Types.ObjectId, ref: UserModel },
//     currentOccupants: {
//         type: Number,
//         default: 0
//     },
//     lastOwner: {
//     type: mongoose.Schema.Types.ObjectId,ref: UserModel
//   },

// })

// module.exports = mongoose.model('Room', Schema)

const mongoose = require('mongoose');
const UserModel = require('../models/User.model');

const Schema = mongoose.Schema({
    type: {
        type: String,
        required: [true, 'Le type de logement est requis'],
        enum: {
            values: ['appartement', 'maison', 'villa', 'chambre partagé'],
            message: 'Le type doit être appartement, maison, villa ou chambre partagé'
        }
    },
    etage: {
        type: Number,
        validate: {
            validator: function(value) {
                // For apartments and shared rooms, etage is required and must be > 0
                if (['appartement', 'chambre partagé'].includes(this.type)) {
                    return value && value > 0;
                }
                // For houses and villas, etage can be 0 or not provided
                return true;
            },
            message: 'L\'étage est requis pour les appartements et chambres partagées'
        }
    },
    assensceur: {
        type: String,
        validate: {
            validator: function(value) {
                // Required for apartments and shared rooms
                if (['appartement', 'chambre partagé'].includes(this.type)) {
                    return value && ['avec', 'sans'].includes(value);
                }
                return true;
            },
            message: 'L\'ascenseur (avec/sans) est requis pour les appartements et chambres partagées'
        }
    },
    garage: {
        type: String,
        validate: {
            validator: function(value) {
                // Required for houses and villas
                if (['maison', 'villa'].includes(this.type)) {
                    return value && ['avec', 'sans'].includes(value);
                }
                return true;
            },
            message: 'Le garage (avec/sans) est requis pour les maisons et villas'
        }
    },
    etat: {
        type: String,
        required: [true, 'L\'état du logement est requis'],
        enum: {
            values: ['nouveau', 'bon-etat'],
            message: 'L\'état doit être nouveau ou bon-etat'
        }
    },
    disponibilite: {
        type: Date,
        required: [true, 'La date de disponibilité est requise'],
        validate: {
            validator: function(value) {
                return value >= new Date().setHours(0, 0, 0, 0);
            },
            message: 'La date de disponibilité doit être aujourd\'hui ou dans le futur'
        }
    },
    region: {
        type: String,
        required: [true, 'La région est requise'],
        trim: true
    },
    ville: {
        type: String,
        required: [true, 'La ville est requise'],
        trim: true
    },
    quartier: {
        type: String,
        required: [true, 'Le quartier est requis'],
        trim: true
    },
    price: {
        type: Number,
        required: [true, 'Le prix est requis'],
        min: [1, 'Le prix doit être supérieur à 0']
    },
    cautionnement: {
        type: Number,
        required: [true, 'Le cautionnement est requis'],
        min: [0, 'Le cautionnement doit être supérieur ou égal à 0']
    },
    nombreDeColocation: {
        type: Number,
        required: [true, 'Le nombre de places est requis'],
        min: [1, 'Le nombre de places doit être au moins 1']
    },
    Equipement: [{
        path: String,
        name: String
    }],
    photos: {
        type: [{
            path: String,
            size: Number,
            name: String
        }],
        validate: {
            validator: function(value) {
                return value && value.length > 0;
            },
            message: 'Au moins une photo est requise'
        }
    },
    description: {
        type: String,
        required: [true, 'La description est requise'],
        trim: true,
        minlength: [10, 'La description doit contenir au moins 10 caractères'],
        maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères']
    },
    gaz: {
        type: Boolean,
        default: false
    },
    electricite: {
        type: Boolean,
        default: false
    },
    chambres: {
        type: Number,
        required: [true, 'Le nombre de chambres est requis'],
        min: [1, 'Le nombre de chambres doit être au moins 1']
    },
    lits: {
        type: Number,
        required: [true, 'Le nombre de lits est requis'],
        min: [1, 'Le nombre de lits doit être au moins 1']
    },
    sdb: {
        type: Number,
        required: [true, 'Le nombre de salles de bains est requis'],
        min: [1, 'Le nombre de salles de bains doit être au moins 1']
    },
    user_id: { 
        type: mongoose.Types.ObjectId, 
        ref: UserModel,
        required: [true, 'L\'utilisateur est requis']
    },
    currentOccupants: {
        type: Number,
        default: 0
    },
    occupants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: UserModel
    }],
    lastOwner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: UserModel
    }
});

Schema.index({ user_id: 1 });
Schema.index({ occupants: 1 });

module.exports = mongoose.model('Room', Schema);