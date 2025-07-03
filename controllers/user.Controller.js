const UserModel = require('../models/User.model');
const RoomModel = require('../models/Room.model')
const { encodeRoomId } = require("../utils/hashids");

let UsersList = [];
const fs = require('fs');
const path = require('path');




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
            user.photo = req.files.photo.path
        }
        await user.save()
        res.send(user)
    } catch (err) {
        res.status(422).send(err)
    }
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
                                    .select('type etat region price user_id') // Select the fields you need
                                    .lean();




        const archivedRooms = await RoomModel.find({ user_id: null, lastOwner: req.params.id })  //new
        .select('type region price') // You can add other fields if needed                        //new
        .lean();                                                                                 //new


        user.room = room || null; // Add the room data to the user object
         user.archivedRooms = archivedRooms;                                                   //new

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
//       const { 
//         searchType, 
//         governorate, 
//         city, 
//         ageMin, 
//         ageMax, 
//         budgetMin, 
//         budgetMax, 
//         moveInDate 
//       } = req.body;
  
//       let query = {};
  
//       // Basic filters
//       if (governorate) query.governorate = governorate;
//       if (city) query.city = city;
  
//       if (ageMin || ageMax) {
//         query.age = {};
//         if (ageMin) query.age.$gte = ageMin;
//         if (ageMax) query.age.$lte = ageMax;
//       }
  
//       if (budgetMin || budgetMax) {
//         query.budget = {};
//         if (budgetMin) query.budget.$gte = budgetMin;
//         if (budgetMax) query.budget.$lte = budgetMax;
//       }
  
//       // Fetch users with basic filters
//       let filteredUsers = await UserModel.find(query);
  
//       // Apply room-based filters and transform photo URLs
//       const applyRoomFilters = async (users) => {
//         return Promise.all(users.map(async user => {
//           const room = await RoomModel.findOne({ user_id: user._id });
            
//           const transformedUser = {
//             ...user.toObject(), // Convert Mongoose document to plain JavaScript object
//             photo: user.photo ? `http://localhost:3003/${user.photo.replace("\\", "/")}` : null,
//             roomId: room ? room._id : null
//           };
  
//           return transformedUser;
//         }));
//       };
  
//           const filterByRoom = async (users, hasRoom) => {
//               const promises = users.map(async user => {
//                   const room = await RoomModel.findOne({ user_id: user._id });
//                   return (!!room === hasRoom) ? user : null;
//               });
//               return (await Promise.all(promises)).filter(Boolean);
//           };
  
//       // Apply search type filters
//       if (searchType === "coloc") {
//         filteredUsers = await filterByRoom(filteredUsers, false);
//       } else if (searchType === "coloc-avec-chambre") {
//         filteredUsers = await filterByRoom(filteredUsers, true);
//       }
      
//       // Move-in Date filter
//       if (moveInDate && (searchType === "coloc-avec-chambre" || searchType === "les-deux")) {
//         const rooms = await RoomModel.find({ 
//           disponibilite: { $gte: new Date(moveInDate) } 
//         });
//         const roomIds = rooms.map(room => room._id.toString());
  
//         const promises = filteredUsers.map(async user => {
//           const room = await RoomModel.findOne({ user_id: user._id });
//           return !room || roomIds.includes(room._id.toString()) ? user : null;
//         });
//         filteredUsers = (await Promise.all(promises)).filter(Boolean);
//       }
//          // Apply photo transformation to all users
//          filteredUsers = await applyRoomFilters(filteredUsers);
      
//       res.status(200).json(filteredUsers);
//     } catch (error) {
//       console.error("Error filtering users:", error);
//       res.status(500).json({ error: "An error occurred while filtering users." });
//     }
//   };
  



// const getUserById = async (req, res) => {
//     try {
//         const user = await UserModel.findById(req.params.id)
//             .select('-password')
//             .lean();

//         if (!user) {
//             return res.status(404).send({ message: 'User not found' });
//         }

//         // Format photo URL
//         if (user.photo) {
//             user.photo = `http://localhost:3003/${user.photo.replace(/\\/g, "/")}`;
//         }

//         // Find Room by User ID
//         const room = await RoomModel.findOne({ user_id: req.params.id })
//             .select('type etat region price user_id')
//             .lean();

//         // Encode room ID
//         let encodedRoomId = null;
//         if (room && room._id) {
//             encodedRoomId = encodeRoomId(room._id);
//         }

//         // Archived rooms
//         const archivedRooms = await RoomModel.find({ user_id: null, lastOwner: req.params.id })
//             .select('type region price')
//             .lean();

//         user.roomId = encodedRoomId; // << send this to frontend
//         user.room = room || null;
//         user.archivedRooms = archivedRooms;

//         res.status(200).json({
//             success: true,
//             data: user
//         });
//     } catch (err) {
//         if (err.name === 'CastError') {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Invalid user ID format'
//             });
//         }
//         res.status(500).json({
//             success: false,
//             message: 'Server error',
//             error: err.message
//         });
//     }
// };



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
      moveInDate,
      gender // Add gender to the destructured parameters
    } = req.body;

    let query = {};

    // Basic filters
    if (governorate) query.governorate = governorate;
    if (city) query.city = city;

    // Important: Add gender filter
    // If gender is specified in the request, use it
    // Otherwise, get the gender from the authenticated user
    if (gender) {
      query.gender = gender;
    } else {
      // Get current user from token to determine their gender
      const token = req.headers['authorization'].replace(/^Bearer\s+/, "");
      const decoded = jwt.verify(token, process.env.SECRET);
      const currentUser = await UserModel.findById(decoded._id);
      if (currentUser) {
        // Filter to show only users of the same gender
        query.gender = currentUser.gender;
      }
    }

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

    // Exclude current user from results
    if (req.user && req.user._id) {
      filteredUsers = filteredUsers.filter(user => user._id.toString() !== req.user._id.toString());
    }
    
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