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

exports.setSocketIo = (socketIoInstance) => {
    io = socketIoInstance;
};





exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(422).send({ message: 'Email et mot de passe requis.' });
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

    const token = jwt.sign({ _id: user._id, role: 'test' }, process.env.SECRET);

    // Emit socket event
    const io = socketIO.getIO();
    io.emit('user_connected', `${user.firstname} is connected`);

    return res.send({
      firstname: user.firstname,
      token,
      gender: user.gender
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send({ message: 'Erreur interne du serveur.' });
  }
};








exports.register = async (req, res) => {
    try {
      const existingUser = await UserModel.findOne({ email: req.body.email });
      if (existingUser) {
        return res.status(422).send({ message: 'User already exists!' });
      }


        const photoPath = req.files?.photo?.path;

    // ✅ Validate image via YOLOv5 Flask API
        if (photoPath) {
          const form = new FormData();
          form.append('image', fs.createReadStream(photoPath));

          const response = await axios.post('http://127.0.0.1:5000/detect-person', form, {
            headers: form.getHeaders(),
          });

          const { person_detected } = response.data;
          if (!person_detected) {
            // Delete the uploaded file (optional cleanup)
            fs.unlinkSync(photoPath);
            return res.status(400).send({ message: 'Profile photo must contain a person!' });
          }
        }
  
      const privatekey = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(req.body.password, privatekey);
  
      // Create user with all form data
      const newUser = new UserModel({
        ...req.body,
        password: hashedPassword,
        photo: photoPath || null      //req.files?.photo ? req.files.photo.path : null
      });
  
      await newUser.save();
  
      // Generate a token for the new user
      let token = jwt.sign({ _id: newUser._id, role: 'test' }, process.env.SECRET);
  
      // Send the token and user information in the response
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
                date.setHours(date.getHours() + 1)
                user.resetTimeout = date.getTime()
                console.log(user.resetKey)

                let mailContent = {
                    from: 'NODE APP',
                    to: user.email,
                    subject: 'Reset Password',
                    text: 'reset password : ' + user.resetKey
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

  
