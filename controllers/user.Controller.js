const UserModel = require('../models/User.model');



const getAll = async(req, res) => {
    console.log(req.ch)
    let list = await UserModel.find()
    res.send(list)

}



const CreateUser = async(req, res) => {

    try {
        let user = new UserModel(req.body)

        if (req.files && req.files.photo) {
            // nom : model(image) = nom  : postman(avatar)
            user.photo = req.files.photo.path
        }
        await user.save()
        res.send(user)
    } catch (err) {
        res.status(422).send(err)
    }

    //try catch 5tr l func tnjm tecrashi l serveur
}


const updateUser = (req, res) => {
    UserModel.updateOne({ _id: req.params.id }, req.body)
        .then((result) => { res.send(result) })
        .catch((err) => { res.status(422).send(err) })
}


const deleteUser = (req, res) => {
    UserModel.deleteOne({ _id: req.params.id })
        .then(result => res.send(result))
        .catch(err => res.status(422).send(err))

}

module.exports = { getAll, CreateUser, updateUser, deleteUser }