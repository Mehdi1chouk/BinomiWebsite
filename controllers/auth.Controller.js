const { response } = require("express");
const UserModel = require('../models/User.model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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