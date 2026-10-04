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
const { rejectIfNotImage } = require('../utils/validateImage');
const { buildActionEmailHtml } = require('../utils/emailTemplate');

// Tokens used to never expire, so a leaked/stolen token stayed valid forever.
// 7 days bounds a silent, undetected leak — the actual kill-switch for a
// KNOWN incident (password change, ban) is tokenVersion, which invalidates
// every existing token immediately regardless of this value.
const JWT_EXPIRES_IN = '7d';

// Shared by register/resetPassword/updatePassword so the policy can't drift
// between signup and every other way a password gets set — previously only
// register() enforced this, so a reset or password-change could set a
// password weaker than signup would ever have allowed.
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
const WEAK_PASSWORD_MESSAGE = 'Le mot de passe doit contenir au moins: 1 majuscule, 1 minuscule, 1 chiffre et 6 caractères minimum';

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

    // 3. Validate email format — nothing else here checks this, so a
    // malformed address (no @, no domain) would otherwise only surface later
    // as an undeliverable password-reset/notification email.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(req.body.email.trim())) {
      return res.status(400).send({
        message: 'Adresse email invalide'
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
    if (!STRONG_PASSWORD_REGEX.test(password)) {
      return res.status(400).send({ message: WEAK_PASSWORD_MESSAGE });
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
    if (!req.file) {
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
    let photoPath = req.file.path;

    // multer accepts any file regardless of content — reject anything that
    // doesn't actually decode as an image before it's ever sent to Flask or
    // saved as this user's permanent profile photo.
    if (!(await rejectIfNotImage(photoPath))) {
      return res.status(400).send({ message: 'Fichier image invalide.' });
    }

    const form = new FormData();
    form.append('image', fs.createReadStream(photoPath));

    // Not hardcoded 127.0.0.1: that only ever reaches this same container
    // once Node and Flask run as separate Docker services — FLASK_API_URL
    // (e.g. http://flask-api:5000) is what actually resolves to the Flask
    // container. Falls back to loopback for local dev without Docker.
    const response = await axios.post(`${process.env.FLASK_API_URL || 'http://127.0.0.1:5000'}/predict`, form, {
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
    // Explicit whitelist, not ...req.body: this is a public, unauthenticated
    // endpoint — connect-multiparty puts every form field onto req.body as a
    // string, so spreading it let a request simply include role=admin,
    // isVerified=true, isBanned=false, tokenVersion=0, etc. and have them
    // saved verbatim, handing out an admin JWT on signup. Same pattern as
    // USER_EDITABLE_FIELDS in user.Controller.js's updateUser.
    const REGISTER_FIELDS = [
      'firstname', 'lastname', 'age', 'email',
      'gender', 'governorate', 'city', 'profession', 'workplace', 'budget'
    ];
    const registerData = {};
    for (const field of REGISTER_FIELDS) {
      if (req.body[field] !== undefined) registerData[field] = req.body[field];
    }

    const newUser = new UserModel({
      ...registerData,
      preferences,
      password: hashedPassword,
      photo: photoPath
    });

    await newUser.save();

    // 10. Generate token and send response
    const token = jwt.sign({ _id: newUser._id, role: newUser.role, tokenVersion: newUser.tokenVersion }, process.env.SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.send({
      firstname: newUser.firstname,
      token: token
    });

  } catch (err) {
    // The check above (line 168) has a race: two signups for the same email
    // at the exact same moment can both pass it before either one's save()
    // finishes, so the real guarantee is the unique index on email — a
    // violation lands here as a MongoDB E11000 error, not caught above. Give
    // it the same friendly message instead of leaking the raw Mongo error
    // string (collection/index names) to the client.
    if (err.code === 11000) {
      return res.status(422).send({ message: 'User already exists!' });
    }
    res.status(500).send({
      message: 'Registration failed',
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
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
        // Was unenforced here — only register() checked this, so a reset
        // could set a password weaker than signup would ever allow.
        if (!STRONG_PASSWORD_REGEX.test(newPassword)) {
            return res.status(400).send({ message: WEAK_PASSWORD_MESSAGE });
        }
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
            // Was `res.send(err)` — the raw Error object, inconsistent with
            // every other catch block's sanitized-in-production pattern.
            res.status(404).send({
                message: 'An error occurred while resetting the password',
                error: process.env.NODE_ENV === 'production' ? undefined : err.message
            })
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

    // Was unenforced here too — same as resetPassword.
    if (!STRONG_PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).send({ message: WEAK_PASSWORD_MESSAGE });
    }

    // verifytoken only proves the caller IS someone; without this, any logged-in
    // user could pass any other user's id here and — if they already knew that
    // user's current password for some other reason (e.g. a reused/leaked
    // password) — change it, locking the real owner out. Only the account
    // owner may change their own password.
    if (req.user._id !== userId) {
      return res.status(403).send({ message: "Vous ne pouvez modifier que votre propre mot de passe." });
    }

    try {
      const user = await UserModel.findById(userId); // Find user by ID
  
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }
  
      // Check if the old password matches the user's current password
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) {
        // Not 401: that status means "your token is invalid/expired" to the
        // frontend's session-expired interceptor, which force-logs-out and
        // redirects to signin on any 401 — wiping the form before the user
        // could ever see this message. This is a wrong form value, not an
        // auth failure, so it gets an ordinary 400 like the check above.
        return res.status(400).send({ message: "Incorrect old password" });
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
        // Always the same 200 + generic message whether or not the account
        // exists — returning a distinct "user not found" previously let
        // anyone enumerate which emails have accounts just by trying this
        // form. Real sends still only happen below, for an actual match.
        const genericResponse = { message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' }
        try {
            let user = await UserModel.findOne({ email: email })
            if (user) {
                user.resetKey = uuid.v7()
                let date = new Date()
                date.setMinutes(date.getMinutes() + 20)
                user.resetTimeout = date.getTime()
                //console.log(user.resetKey)

                const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/auth/resetpassword?resetKey=${user.resetKey}`
                let mailContent = {
                    from: 'NODE APP',
                    to: user.email,
                    subject: 'Reset Password',
                    text: `You requested a password reset.\nClick the link below to reset your password:\n${resetUrl}\n\nIf you did not request this, please ignore this email.`,
                    html: buildActionEmailHtml({
                        heading: 'Réinitialisation du mot de passe',
                        bodyLines: [
                            'Vous avez demandé la réinitialisation de votre mot de passe.',
                            'Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.',
                        ],
                        buttonLabel: 'Réinitialiser mon mot de passe',
                        buttonUrl: resetUrl,
                        footerNote: 'Ce lien expire dans 20 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.',
                    }),
                }
                await transporter.sendMail(mailContent)
                await user.save()
            }
            res.send(genericResponse)
        } catch (err) {
            // A genuine failure (mail service down, DB error) — still never
            // echoes the raw error or says whether the account existed, but
            // unlike the two outcomes above it's reported as a real failure
            // so a legitimate user isn't told "sent" when nothing went out.
            console.log(err)
            res.status(500).send({ message: 'Une erreur est survenue, veuillez réessayer plus tard.' })
        }
    } else {
        res.status(444).send({ message: 'missing information !!' })
    }
};


  
