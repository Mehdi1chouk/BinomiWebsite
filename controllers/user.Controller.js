const UserModel = require('../models/User.model');
const RoomModel = require('../models/Room.model')
let UsersList = [];
const fs = require('fs');
const path = require('path');


const getAll = async (req, res) => {
    try {
        let usersList = await UserModel.find().lean(); // Use .lean() for performance

        // Fetch rooms for each user
        const usersWithRooms = await Promise.all(usersList.map(async (user) => {
            const room = await RoomModel.findOne({ user_id: user._id }).select('_id'); // Get only the room ID

            return {
                ...user,
                photo: user.photo ? `http://localhost:3003/${user.photo.replace("\\", "/")}` : null,
                roomId: room ? room._id : null // Include room ID if exists, else null
            };
        }));

        res.status(200).json({
            success: true,
            data: usersWithRooms
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error.message
        });
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

const updateUser = async (req, res) => {
    try {
        // Find the user first
        const user = await UserModel.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Handle the image upload
        let updatedData = { ...req.body };

        // Only update photo if a new one is provided
        if (req.files?.photo) {
            // Remove the old profile image if it exists
            if (user.photo) {
                const oldImagePath = path.join(__dirname, '../', user.photo);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }

            // Save new image path
            updatedData.photo = req.files.photo.path;
        } else {
            // If no new photo, remove photo from updatedData to keep the existing one
            delete updatedData.photo;
        }

        // Update user with new data
        const result = await UserModel.findByIdAndUpdate(
            req.params.id,
            updatedData,
            { new: true, runValidators: true }
        ).select('-password');

        res.status(200).json({ success: true, data: result });

    } catch (err) {
        res.status(422).json({
            success: false,
            message: 'Error updating user',
            error: err.message
        });
    }
};

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
const deleteUser = (req, res) => {
    UserModel.deleteOne({ _id: req.params.id })
        .then(result => res.send(result))
        .catch(err => res.status(422).send(err))

}


module.exports = { getAll, CreateUser, updateUser, deleteUser, filterUser,getUserById }