const { response } = require("express");
const UserModel = require('../models/User.model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const { transporter } = require('./config')
const socketIO = require('../socketio');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
let io;
const BannedEmailModel = require('../models/BannedEmail.model')
const { compressImage } = require('../utils/compressImage');

// Tokens used to never expire, so a leaked/stolen token stayed valid forever.
// 7 days bounds a silent, undetected leak — the actual kill-switch for a
// KNOWN incident (password change, ban) is tokenVersion, which invalidates
// every existing token immediately regardless of this value.
const JWT_EXPIRES_IN = '7d';

const EMAIL_VERIFICATION_EXPIRES_MS = 24 * 60 * 60 * 1000; // 24 hours

// Fire-and-log, not fire-and-fail: a mail-server hiccup here must never
// block signup or a resend request, since the account/session already
// exists independently of whether this email actually goes out.
const sendVerificationEmail = async (user) => {
  const token = uuid.v7();
  user.emailVerificationToken = token;
  user.emailVerificationExpires = Date.now() + EMAIL_VERIFICATION_EXPIRES_MS;
  await user.save();

  const mailContent = {
    from: 'NODE APP',
    to: user.email,
    subject: 'Confirmez votre adresse email - Binomy',
    text: `Bienvenue sur Binomy !\nConfirmez votre adresse email en cliquant sur le lien ci-dessous :\n${process.env.FRONTEND_URL || 'http://localhost:4200'}/auth/verify-email?token=${token}\n\nCe lien expire dans 24 heures.`
  };

  try {
    await transporter.sendMail(mailContent);
  } catch (err) {
    console.error('Failed to send verification email:', err.message);
  }
};
exports.setSocketIo = (socketIoInstance) => {
    io = socketIoInstance;
};



exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(422).send({ message: 'Email et mot de passe requis.' });
    }

    //jdid
      // Check if email is banned
    const bannedEmail = await BannedEmailModel.findOne({ email });
    if (bannedEmail) {
      return res.status(403).send({ 
        message: 'Votre compte a été suspendu en raison de multiples signalements.',
        banned: true 
      });
    }

    const user = await UserModel.findOne({ email });

    if (!user) {
      return res.status(422).send({ message: "L'utilisateur n'existe pas." });
    }

    const passwordUserInDb = user.password;

    const isMatch = await bcrypt.compare(password, passwordUserInDb);
    if (!isMatch) {
      return res.status(422).send({ message: 'Mot de passe incorrect.' });
    }

    const token = jwt.sign({ _id: user._id, role: user.role, tokenVersion: user.tokenVersion }, process.env.SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Emit socket event
    const io = socketIO.getIO();
    io.emit('user_connected', `${user.firstname} is connected`);

    return res.send({
      firstname: user.firstname,
      token,
      gender: user.gender,
      role: user.role
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send({ message: 'Erreur interne du serveur.' });
  }
};





exports.register = async (req, res) => {
  try {
    // 1. Validate required fields
    const requiredFields = [
      'firstname', 'lastname', 'age', 'email', 'password',
      'gender', 'governorate', 'city',
      'profession', 'workplace'
    ];
    
    for (const field of requiredFields) {
      if (!req.body[field] || req.body[field].toString().trim() === '') {
        return res.status(400).send({
          message: `${field} is required`
        });
      }
    }

    // 2. Validate firstname and lastname minimum length (3 characters)
    if (req.body.firstname.trim().length < 3) {
      return res.status(400).send({
        message: 'Le prénom doit contenir au moins 3 caractères'
      });
    }

    if (req.body.lastname.trim().length < 3) {
      return res.status(400).send({
        message: 'Le nom doit contenir au moins 3 caractères'
      });
    }

      // 4. Validate password strength
    const password = req.body.password;
    
    if (password.length < 6) {
      return res.status(400).send({
        message: 'Le mot de passe doit contenir au moins 6 caractères'
      });
    }

    // Strong password validation (at least one uppercase, one lowercase, one number)
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
    
    if (!strongPasswordRegex.test(password)) {
      return res.status(400).send({
        message: 'Le mot de passe doit contenir au moins: 1 majuscule, 1 minuscule, 1 chiffre et 6 caractères minimum'
      });
    }


    // 5. Validate age (must be 2 digits, between 10-60)
    const age = parseInt(req.body.age);
    
    if (isNaN(age) || age < 10 || age > 60) {
      return res.status(400).send({
        message: 'L\'âge doit être entre 10 et 60 ans'
      });
    }

    // 6. Validate budget (optional — only checked when provided)
    if (req.body.budget !== undefined && req.body.budget !== '') {
      const budget = parseInt(req.body.budget);
      if (isNaN(budget) || budget < 50 || budget > 1000) {
        return res.status(400).send({
          message: 'Le budget doit être entre 50 et 1000'
        });
      }
    }

    // 5. Check if photo is uploaded
    if (!req.files?.photo) {
      return res.status(400).send({
        message: 'Profile photo is required'
      });
    }

    // 6. Check if email is banned
    const bannedEmail = await BannedEmailModel.findOne({ email: req.body.email });
    if (bannedEmail) {
      return res.status(403).send({ 
        message: 'Cette adresse email est interdite d\'inscription.',
        banned: true 
      });
    }

    // 7. Check if user already exists
    const existingUser = await UserModel.findOne({ email: req.body.email });
    if (existingUser) {
      return res.status(422).send({ 
        message: 'User already exists!' 
      });
    }

    // 8. Get photo path and validate image via YOLOv5 Flask API
    let photoPath = req.files.photo.path;
    const form = new FormData();
    form.append('image', fs.createReadStream(photoPath));

    const response = await axios.post('http://127.0.0.1:5000/predict', form, {
      headers: form.getHeaders(),
    });

    const { prediction, probabilities } = response.data;

    if (prediction !== 'a real human') {
      // Delete the uploaded file (cleanup)
      fs.unlinkSync(photoPath);
      return res.status(400).send({
        message: 'Profile photo not accepted! Try another one.'
      });
    }

    // Compressed only after the liveness check above, which needs the raw
    // upload — this photo is kept long-term as both the profile picture and
    // the face-verification anchor, so it's worth shrinking. A compression
    // failure shouldn't block signup — fall back to the raw upload.
    photoPath = await compressImage(photoPath, { maxDimension: 800 }).catch(() => photoPath);

    // 8. Hash password
    const privatekey = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(req.body.password, privatekey);

    // Preferences arrive as a JSON string (multipart form field) — parse it
    // back into an object before it hits the schema's nested arrays.
    let preferences;
    if (req.body.preferences) {
      try {
        preferences = JSON.parse(req.body.preferences);
      } catch (e) {
        preferences = undefined;
      }
    }

    // 9. Create and save new user
    const newUser = new UserModel({
      ...req.body,
      preferences,
      password: hashedPassword,
      photo: photoPath
    });

    await newUser.save();

    // Signup completes and the user is logged in immediately regardless of
    // this — email confirmation is a non-blocking nudge, not a gate (see
    // sendVerificationEmail's own comment for why failures here don't throw).
    sendVerificationEmail(newUser).catch(() => {});

    // 10. Generate token and send response
    const token = jwt.sign({ _id: newUser._id, role: newUser.role, tokenVersion: newUser.tokenVersion }, process.env.SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.send({
      firstname: newUser.firstname,
      token: token
    });

  } catch (err) {
    res.status(500).send({
      message: 'Registration failed',
      error: err.message
    });
  }
};

// exports.login = async(req, res) => {

//     try {
//         let user = await UserModel.findOne({ email: req.body.email })

//         if (!user) { response.status(422).send({ message: 'user don t exists !!' }) } else {
//             let passwordUserindb = await user.password
//             let success = await bcrypt.compare(req.body.password, passwordUserindb)
//             if (success) {
//                 let token = jwt.sign({ _id: user._id, role: 'test' }, process.env.SECRET)
//                 const io = socketIO.getIO(); // Get the io instance
//                 console.log('Emitting event: user_connected');
//                 io.emit('user_connected', `${user.firstname} is connected`);
//                 res.send({ firstname: user.firstname, token: token })
//             } else {
//                 res.status(422).send({ message: 'Missing Information !!' })
//             }
//         }
//     } catch (err) {
//         console.log(err)
//         res.status(404).send(err)
//     }

// };
exports.resetPassword = async(req, res) => {
    const { resetKey, newPassword } = req.body
    if (resetKey && newPassword) {
        try {
            let user = await UserModel.findOne({ resetKey: resetKey })
            let time = (new Date()).getTime()
            if (user && time < user.resetTimeout) {
                let privateKey = await bcrypt.genSalt(10)
                user.password = await bcrypt.hash(newPassword, privateKey)
                await user.save()
                res.send({ message: 'password updated ' })
            } else {
                res.status(404).send({ message: 'invalid credential !!' })
            }
        } catch (err) {
            console.log(err)
            res.status(404).send(err)
        }
    } else {
        res.status(444).send({ message: 'missing information !!' })

    }
};

exports.updatePassword = async (req, res) => {
    const { userId } = req.params; // Extract userId from URL params
    const { oldPassword, newPassword } = req.body; // Extract old and new passwords from request body
  
    if (!oldPassword || !newPassword) {
      return res.status(400).send({ message: "Missing password information" });
    }
  
    try {
      const user = await UserModel.findById(userId); // Find user by ID
  
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }
  
      // Check if the old password matches the user's current password
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) {
        return res.status(401).send({ message: "Incorrect old password" });
      }
  
      // Hash the new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
  
      // Update the user's password
      user.password = hashedPassword;
      await user.save();
  
      res.send({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).send({ message: "An error occurred while updating the password" });
    }
  };


  exports.forgotPassword = async(req, res) => {
    let { email } = req.body
    if (email) {
        try {
            let user = await UserModel.findOne({ email: email })
            if (user) {
                user.resetKey = uuid.v7()
                let date = new Date()
                date.setMinutes(date.getMinutes() + 20)
                user.resetTimeout = date.getTime()
                //console.log(user.resetKey)

                let mailContent = {
                    from: 'NODE APP',
                    to: user.email,
                    subject: 'Reset Password',
                    text: `You requested a password reset.\nClick the link below to reset your password:\n${process.env.FRONTEND_URL || 'http://localhost:4200'}/auth/resetpassword?resetKey=${user.resetKey}\n\nIf you did not request this, please ignore this email.`

                    //text: 'reset password : ' + user.resetKey

                }
                await transporter.sendMail(mailContent)
                await user.save()
                res.send({ message: 'mail sent successfully' })
            } else {
                res.status(404).send({ message: 'user not found !!' })
            }
        } catch (err) {
            console.log(err)
            res.status(404).send(err)
        }
    } else {
        res.status(444).send({ message: 'missing information !!' })
    }
};

exports.verifyEmail = async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).send({ message: 'token requis' });
  }

  try {
    const user = await UserModel.findOne({ emailVerificationToken: token });
    if (!user || Date.now() > user.emailVerificationExpires) {
      return res.status(400).send({ message: 'Lien de confirmation invalide ou expiré.' });
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.send({ message: 'Adresse email confirmée avec succès.' });
  } catch (err) {
    res.status(500).send({ message: 'Erreur lors de la confirmation', error: err.message });
  }
};

exports.resendVerificationEmail = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user._id);
    if (!user) {
      return res.status(404).send({ message: 'Utilisateur introuvable' });
    }
    if (user.emailVerified) {
      return res.status(409).send({ message: 'Cette adresse email est déjà confirmée.' });
    }

    await sendVerificationEmail(user);
    res.send({ message: 'Email de confirmation renvoyé.' });
  } catch (err) {
    res.status(500).send({ message: 'Erreur lors de l\'envoi', error: err.message });
  }
};

  
