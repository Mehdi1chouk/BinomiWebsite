const { response } = require("express");
const UserModel = require('../models/User.model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const { transporter } = require('./config')


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
exports.register = async(req, res) => {

    try {
        let user = await UserModel.findOne({ email: req.body.email })

        if (user) { response.status(422).send({ message: 'user exists !!' }) } else {
            // generate private key de puissance  entre 10 et 20
            let privatekey = await bcrypt.genSalt(12)
            let hashedPassword = await bcrypt.hash(req.body.password, privatekey)
            let newUser = new UserModel(req.body)
            newUser.password = hashedPassword
            await newUser.save()
            res.send(newUser)
        }
    } catch (err) {
        res.status(404).send(err)
    }

};


exports.login = async(req, res) => {

    try {
        let user = await UserModel.findOne({ email: req.body.email })

        if (!user) { response.status(422).send({ message: 'user don t exists !!' }) } else {
            let passwordUserindb = await user.password
            let success = await bcrypt.compare(req.body.password, passwordUserindb)
            if (success) {
                let token = jwt.sign({ _id: user._id, role: 'test' }, process.env.SECRET)
                res.send({ firstname: user.firstname, token: token })
            } else {
                res.status(422).send({ message: 'Missing Information !!' })
            }
        }

    } catch (err) {
        console.log(err)
        res.status(404).send(err)
    }

};
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