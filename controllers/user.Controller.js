const UserModel = require('../models/User.model');

let UsersList = [];

const getAll = async(req, res) => {
    console.log(req.ch)
    UsersList = await UserModel.find()
    res.send(UsersList)
    console.log(UsersList)

}




const filterUser = async(req, res, next) => {
    try {
        const filters = req.body;


        const users = await UserModel.find();


        const filteredUsers = users.filter(user => {
            return Object.keys(filters).every(key => {
                // Ensure the filter comparison works correctly (case insensitive for strings)
                if (typeof user[key] === 'string' && typeof filters[key] === 'string') {
                    return user[key].toLowerCase() === filters[key].toLowerCase();
                }
                return user[key] == filters[key];
            });
        });
        if (filteredUsers.length === 0) {
            return res.status(404).send({ message: "No user found with the specified attributes." });
        }

        // Send the filtered users as the response
        res.status(200).send(filteredUsers);
    } catch (error) {
        console.error("Error in filterUser:", error);
        res.status(500).send({ error: "An error occurred while filtering users." });
    }
};




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

module.exports = { getAll, CreateUser, updateUser, deleteUser, filterUser }