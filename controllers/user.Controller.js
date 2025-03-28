const UserModel = require('../models/User.model');
const RoomModel = require('../models/Room.model')
let UsersList = [];
const fs = require('fs');
const path = require('path');


// const getAll = async (req, res) => {
//     try {
//         let usersList = await UserModel.find().lean(); // Use .lean() for performance

//         // Fetch rooms for each user
//         const usersWithRooms = await Promise.all(usersList.map(async (user) => {
//             const room = await RoomModel.findOne({ user_id: user._id }).select('_id'); // Get only the room ID

//             return {
//                 ...user,
//                 photo: user.photo ? `http://localhost:3003/${user.photo.replace("\\", "/")}` : null,
//                 roomId: room ? room._id : null // Include room ID if exists, else null
//             };
//         }));

//         res.status(200).json({
//             success: true,
//             data: usersWithRooms
//         });
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             message: 'Error fetching users',
//             error: error.message
//         });
//     }
// };


// Modified getAll function
const getAll = async (req, res) => {
    try {
      const usersList = await UserModel.find().lean();
      
      // Fetch rooms for each user
      const usersWithRooms = await Promise.all(usersList.map(async (user) => {
        const room = await RoomModel.findOne({ user_id: user._id }).select('_id');
        
        return {
          ...user,
          photo: user.photo ? `http://localhost:3003/${user.photo.replace("\\", "/")}` : null,
          roomId: room ? room._id : null // This is safe since it's only for frontend
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


// const filterUser = async (req, res) => {
//     try {
//         const { governorate, city, ageMin, ageMax, budgetMin, budgetMax } = req.body;
        
//         let query = {};
        
//         if (governorate) query.governorate = governorate;
//         if (city) query.city = city;
        
//         if (ageMin || ageMax) {
//             query.age = {};
//             if (ageMin) query.age.$gte = ageMin;
//             if (ageMax) query.age.$lte = ageMax;
//         }
        
//         if (budgetMin || budgetMax) {
//             query.budget = {};
//             if (budgetMin) query.budget.$gte = budgetMin;
//             if (budgetMax) query.budget.$lte = budgetMax;
//         }
        
//         // Fetch users with all fields
//         let filteredUsers = await UserModel.find(query);
        
//         if (filteredUsers.length === 0) {
//             return res.status(404).json({ message: "No users found with the specified criteria." });
//         }
        
//         // Apply the same photo URL transformation as in getAll function
//         filteredUsers = filteredUsers.map(user => ({
//             ...user._doc,
//             photo: user.photo ? `http://localhost:3003/${user.photo.replace("\\", "/")}` : null
//         }));
        
//         res.status(200).json(filteredUsers);
//     } catch (error) {
//         console.error("Error filtering users:", error);
//         res.status(500).json({ error: "An error occurred while filtering users." });
//     }
// };

// const filterUser = async (req, res) => {
//     try {
//         const { 
//             searchType, 
//             governorate, 
//             city, 
//             ageMin, 
//             ageMax, 
//             budgetMin, 
//             budgetMax, 
//             moveInDate 
//         } = req.body;

//         let query = {};

//         // Governorate filter
//         if (governorate) query.governorate = governorate;

//         // City filter
//         if (city) query.city = city;

//         // Age filter
//         if (ageMin || ageMax) {
//             query.age = {};
//             if (ageMin) query.age.$gte = ageMin;
//             if (ageMax) query.age.$lte = ageMax;
//         }

//         // Budget filter
//         if (budgetMin || budgetMax) {
//             query.budget = {};
//             if (budgetMin) query.budget.$gte = budgetMin;
//             if (budgetMax) query.budget.$lte = budgetMax;
//         }

//         // Search Type filter
//         if (searchType === "coloc") {
//             // Users without rooms
//             query.roomId = null;
//         } else if (searchType === "coloc-avec-chambre") {
//             // Users with rooms
//             query.roomId = { $ne: null };
//         }
//         // For "les-deux", we don't modify the query, so it will return all users

//         // Fetch filtered users
//         let filteredUsers = await UserModel.find(query);

//         // Move-in Date filter (only for coloc-avec-chambre or les-deux)
//         if (moveInDate && (searchType === "coloc-avec-chambre" || searchType === "les-deux")) {
//             // Fetch rooms available on or after the selected date
//             const rooms = await RoomModel.find({ 
//                 disponibilite: { $gte: new Date(moveInDate) } 
//             });
            
//             const roomIds = rooms.map(room => room._id.toString());
            
//             // Filter users to only include those with rooms available on or after the selected date
//             filteredUsers = filteredUsers.filter(user => 
//                 user.roomId === null || roomIds.includes(user.roomId)
//             );
//         }

//         res.status(200).json(filteredUsers);
//     } catch (error) {
//         console.error("Error filtering users:", error);
//         res.status(500).json({ error: "An error occurred while filtering users." });
//     }
// };


// Corrected filter function
const filterUser = async (req, res) => {
    try {
      const { 
        searchType, 
        governorate, 
        city, 
        ageMin, 
        ageMax, 
        budgetMin, 
        budgetMax, 
        moveInDate 
      } = req.body;
  
      let query = {};
  
      // Basic filters
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
  
      // Fetch users with basic filters
      let filteredUsers = await UserModel.find(query);
  
      // Apply room-based filters and transform photo URLs
      const applyRoomFilters = async (users) => {
        return Promise.all(users.map(async user => {
          const room = await RoomModel.findOne({ user_id: user._id });
            
          const transformedUser = {
            ...user.toObject(), // Convert Mongoose document to plain JavaScript object
            photo: user.photo ? `http://localhost:3003/${user.photo.replace("\\", "/")}` : null,
            roomId: room ? room._id : null
          };
  
          return transformedUser;
        }));
      };
  
          const filterByRoom = async (users, hasRoom) => {
              const promises = users.map(async user => {
                  const room = await RoomModel.findOne({ user_id: user._id });
                  return (!!room === hasRoom) ? user : null;
              });
              return (await Promise.all(promises)).filter(Boolean);
          };
  
      // Apply search type filters
      if (searchType === "coloc") {
        filteredUsers = await filterByRoom(filteredUsers, false);
      } else if (searchType === "coloc-avec-chambre") {
        filteredUsers = await filterByRoom(filteredUsers, true);
      }
      
      // Move-in Date filter
      if (moveInDate && (searchType === "coloc-avec-chambre" || searchType === "les-deux")) {
        const rooms = await RoomModel.find({ 
          disponibilite: { $gte: new Date(moveInDate) } 
        });
        const roomIds = rooms.map(room => room._id.toString());
  
        const promises = filteredUsers.map(async user => {
          const room = await RoomModel.findOne({ user_id: user._id });
          return !room || roomIds.includes(room._id.toString()) ? user : null;
        });
        filteredUsers = (await Promise.all(promises)).filter(Boolean);
      }
         // Apply photo transformation to all users
         filteredUsers = await applyRoomFilters(filteredUsers);
      
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