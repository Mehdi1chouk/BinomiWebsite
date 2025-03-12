const UserModel = require('../models/User.model');
const RoomModel = require('../models/Room.model')
let UsersList = [];

const getAll = async (req, res) => {
    UsersList = await UserModel.find();
    
    // Convert image path to URL
    UsersList = UsersList.map(user => ({
        ...user._doc,
        photo: user.photo ? `http://localhost:3003/${user.photo.replace("\\", "/")}` : null
    }));

    res.send(UsersList);
};

// const getAll = async(req, res) => {
//     console.log(req.ch)
//     UsersList = await UserModel.find()
//     res.send(UsersList)
//     //console.log(UsersList)

// }




const filterUser = async (req, res) => {
    try {
        const { governorate, city, ageMin, ageMax, budgetMin, budgetMax } = req.body;
        
        let query = {};
        
        if (governorate) query.governorate = governorate;
        if (city) query.city = city;
        
        if (ageMin || ageMax) {
            query.age = {};
            if (ageMin) query.age.$gte = ageMin;
            if (ageMax) query.age.$lte = ageMax;
        }
        
        if (budgetMin || budgetMax) {
            query.budget = {};
            if (budgetMin) query.budget.$gte = budgetMin;
            if (budgetMax) query.budget.$lte = budgetMax;
        }
        
        // Fetch users with all fields
        let filteredUsers = await UserModel.find(query);
        
        if (filteredUsers.length === 0) {
            return res.status(404).json({ message: "No users found with the specified criteria." });
        }
        
        // Apply the same photo URL transformation as in getAll function
        filteredUsers = filteredUsers.map(user => ({
            ...user._doc,
            photo: user.photo ? `http://localhost:3003/${user.photo.replace("\\", "/")}` : null
        }));
        
        res.status(200).json(filteredUsers);
    } catch (error) {
        console.error("Error filtering users:", error);
        res.status(500).json({ error: "An error occurred while filtering users." });
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


const getUserById = async (req, res) => {
    try {
        const user = await UserModel.findById(req.params.id)
            .select('-password')
            .lean();

        if (!user) {
            return res.status(404).send({ message: 'User not found' });
        }

        // Format photo URL
        if (user.photo) {
            user.photo = `http://localhost:3003/${user.photo.replace(/\\/g, "/")}`;
        }

        // Find Room by User ID
        const room = await RoomModel.findOne({ user_id: req.params.id })
                                    .select('type etat region price') // Select the fields you need
                                    .lean();

        user.room = room || null; // Add the room data to the user object

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        if (err.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format'
            });
        }
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: err.message
        });
    }
};



module.exports = { getAll, CreateUser, updateUser, deleteUser, filterUser,getUserById }