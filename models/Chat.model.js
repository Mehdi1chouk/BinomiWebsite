const UserModel = require('../models/User.model');
const mongoose = require('mongoose');

const Schema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: UserModel, required: true }, // Sender ID
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: UserModel, required: true }, // Receiver ID
    message: { type: String, required: true }, // chat content
    createdAt: { type: Date, default: Date.now }, // Timestamp
    isRead: { type: Boolean, default: false } // chat status (read/unread)
});

// Every chat query filters by sender+receiver in one direction or the other
// (a conversation is unordered), so both directions need their own compound
// index — without these, every message fetch/conversation list/unread count
// was a full collection scan.
Schema.index({ sender: 1, receiver: 1, createdAt: -1 });
Schema.index({ receiver: 1, sender: 1, createdAt: -1 });

module.exports = mongoose.model('chat', Schema);


// const mongoose = require('mongoose');
// const UserModel = require('./User.model');

// const ConversationSchema = new mongoose.Schema({
//   user1: { 
//     type: mongoose.Schema.Types.ObjectId, 
//     ref: UserModel, 
//     required: true 
//   },
//   user2: { 
//     type: mongoose.Schema.Types.ObjectId, 
//     ref: UserModel, 
//     required: true 
//   },
//   messages: [{
//     sender: { 
//       type: mongoose.Schema.Types.ObjectId, 
//       ref: UserModel, 
//       required: true 
//     },
//     content: { 
//       type: String, 
//       required: true 
//     },
//     timestamp: { 
//       type: Date, 
//       default: Date.now 
//     },
//     read: { 
//       type: Boolean, 
//       default: false 
//     }
//   }],
//   lastActivity: {
//     type: Date,
//     default: Date.now
//   }
// });

// module.exports = mongoose.model('Chat', ConversationSchema);