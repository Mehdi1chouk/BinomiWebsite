const RoomModel = require("../models/Room.model")
const UserModel = require("../models/User.model")


const getRoombyUserId = async(req, res) => {
    let list = await RoomModel.find({ user_id: req.user._id }).populate({ path: 'user_id', select: 'firstName lastName' });
    res.send(list)

}

const getAllRooms = async (req, res) => {
    try {
        let RoomsList = await RoomModel.find();

        // Convertir les chemins d'images en URL complètes
        RoomsList = RoomsList.map(room => ({
            ...room._doc,
            photos: room.photos.map(photo => `http://localhost:3003/${photo.path.replace("\\", "/")}`),
            Equipement: room.Equipement.map(equip => ({
                ...equip,
                path: `http://localhost:3003/${equip.path.replace("\\", "/")}`
            }))
        }));

        res.send(RoomsList);
    } catch (err) {
        res.status(500).send({ message: 'Error retrieving rooms', error: err.message });
    }
};



const CreateRoom = async (req, res) => {
    try {
        // Create the room with the basic form data
        let Room = new RoomModel({
            ...req.body,
            user_id: req.user._id,
            lastOwner: req.user._id

        });

        // Handle photos
        // Handle photos
if (req.files && req.files.photos) {
    // Check if photos is an array or a single file
    if (Array.isArray(req.files.photos)) {
        Room.photos = req.files.photos.map(photo => ({
            path: photo.path.replace("\\", "/"), // Normalize the path
            name: photo.filename || photo.originalname
        }));
    } else {
        // Handle single file case
        Room.photos = [{
            path: req.files.photos.path.replace("\\", "/"),
            name: req.files.photos.filename || req.files.photos.originalname
        }];
    }
}

        // Parse the equipment data sent from frontend
        if (req.body.selectedEquipment) {
            try {
                const selectedEquipmentArray = JSON.parse(req.body.selectedEquipment);
                Room.Equipement = selectedEquipmentArray.map(item => ({
                    name: item.name,
                    path: item.icon // We're using the icon ID as the path since we can't send the actual file
                }));
            } catch (parseError) {
                console.error('Error parsing equipment data:', parseError);
            }
        }

        await Room.save();
        res.status(201).send(Room);
    } catch (err) {
        console.error('Error saving room:', err);
        res.status(422).send({
            message: 'Failed to save room',
            error: err.message
        });
    }
};

const incrementOccupants = async (req, res) => {
    const roomId = req.params.id;

    try {
        const updatedRoom = await RoomModel.findByIdAndUpdate(
            roomId,
            { $inc: { currentOccupants: 1 } },
            { new: true } // Return the updated document
        );

        if (!updatedRoom) {
            return res.status(404).json({ message: 'Room not found' });
        }

        res.status(200).json(updatedRoom);
    } catch (err) {
        console.error('Error incrementing occupants:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const decrementOccupants = async (req, res) => {
    try {
        const roomId = req.params.id;
        const room = await RoomModel.findById(roomId);

        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }

        if (room.currentOccupants > 0) {
            room.currentOccupants -= 1;
            await room.save();
        }

        res.status(200).json(room);
    } catch (error) {
        console.error('Error decrementing occupants:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};



const updateRoom = async (req, res) => {
    try {
        // Get the current room to compare what changed
        const existingRoom = await RoomModel.findById(req.params.id);
        
        if (!existingRoom) {
            return res.status(404).send({ message: 'Room not found' });
        }
        
        // Check if the user is authorized to update this room
        if (existingRoom.user_id.toString() !== req.user._id.toString()) {
            return res.status(403).send({ message: 'Not authorized to update this room' });
        }
        
        // Start with updating text fields
        const updateData = { ...req.body };

        
        // Handle the etage field specifically
        if (updateData.etage === "null" || updateData.etage === "") {
            updateData.etage = 0; // Convert to number 0 instead of string "null"
        } else if (updateData.etage !== undefined) {
            updateData.etage = Number(updateData.etage); // Ensure it's a number
        }

        // ✅ Ensure `user_id` is correctly formatted
        if (req.body.user_id && typeof req.body.user_id === "object") {
            updateData.user_id = req.body.user_id._id; // Extract only the _id
        }

        // Handle equipment data
        if (req.body.selectedEquipment) {
            try {
                const selectedEquipment = JSON.parse(req.body.selectedEquipment);
                updateData.Equipement = selectedEquipment.map(item => ({
                    name: item.name,
                    path: item.icon // Store the equipment ID consistently
                }));
                delete updateData.selectedEquipment; // Remove as it's not part of the schema
            } catch (parseError) {
                console.error('Error parsing equipment data:', parseError);
            }
        }

        // ✅ FIXED: Handle photos update logic
        // Initialize photos array to handle all cases
        updateData.photos = [];

        // Case 1: Keep some/all existing photos
        if (req.body.keepPhotos) {
            try {
                const keepPhotoUrls = JSON.parse(req.body.keepPhotos);
                console.log("Photos to keep:", keepPhotoUrls);
                
                // Filter and keep only the photos that exist in keepPhotoUrls
                // First, convert URLs back to file paths if needed
                const existingPhotosToKeep = existingRoom.photos.filter(photo => {
                    const photoUrl = `http://localhost:3003/${photo.path.replace("\\", "/")}`;
                    return keepPhotoUrls.includes(photoUrl) || keepPhotoUrls.includes(photo.path);
                });
                
                updateData.photos = [...existingPhotosToKeep];
                console.log("Keeping photos:", existingPhotosToKeep);
            } catch (error) {
                console.error("Error parsing keepPhotos:", error);
            }
        } else if (!req.files || !req.files.photos) {
            // If no keepPhotos and no new photos, keep current photos as is
            updateData.photos = existingRoom.photos;
        }

        // Case 2: Add any new photos
        if (req.files && req.files.photos) {
            const newPhotos = Array.isArray(req.files.photos) 
                ? req.files.photos 
                : [req.files.photos];

            const newPhotoObjects = newPhotos.map(photo => ({
                path: photo.path.replace("\\", "/"),
                name: photo.filename || photo.originalname
            }));

            updateData.photos = [...updateData.photos, ...newPhotoObjects];
            console.log("Added new photos:", newPhotoObjects);
        }

        delete updateData.keepPhotos; // Remove temporary field from update data

        // Update the room
        const result = await RoomModel.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        res.send(result);
    } catch (err) {
        console.error('Error updating room:', err);
        res.status(422).send({
            message: 'Failed to update room',
            error: err.message,
            details: err.errors ? Object.keys(err.errors).map(key => ({
                field: key,
                message: err.errors[key].message
            })) : null
        });
    }
};



const deleteRoom = (req, res) => {
    RoomModel.deleteOne({ _id: req.params.id })
        .then(result => res.send(result))
        .catch(err => res.status(422).send(err))

}

// Remove the user_id from the room to archive it
const archiveRoom = async (req, res) => {
  try {
    const roomId = req.params.id;

    // Just for debugging
    console.log('req.user:', req.user);

    const userId = req.user?._id;

    const result = await RoomModel.findByIdAndUpdate(
      roomId,
      {
        $unset: { user_id: "" },
        $set: { lastOwner: userId || null }
      },
      { new: true }
    );

    if (!result) return res.status(404).send({ message: "Room not found" });

    res.send({ message: "Room archived", room: result });
  } catch (error) {
    console.error('Archive error:', error);
    res.status(500).send({ error: "Failed to archive room" });
  }
};






const filter = async(req, res) => {

    let Rooms = await RoomModel.find({
        type: { $regex: 'villa', $options: 'i' }
    })
    res.send(Rooms)
}



const search = async(req, res) => {
    let text = req.params.text
    let Rooms = await RoomModel.find({
        $or: [
            /* { price: { $regex: text, $options: 'i' } },*/ // you need to cast the price to string to let it work
            { region: { $regex: text, $options: 'i' } },
        ]
    })
    let userId = Rooms.map(exp => exp.user_id)
    let users = await UserModel.find({ _id: { $in: userId } })
    res.send(users)
}

const usersWithRoom = async(req, res) => {
    let users = await UserModel.find().limit();

    let result = []
    await Promise.all(
        users.map(async(user) => {
            let userRoom = await RoomModel.find({ user_id: user._id })
            result.push({...user._doc, Rooms: userRoom })
        })
    )
    res.send(result)

}

const getRoomById = async (req, res) => {
    try {
        const room = await RoomModel.findById(req.params.id)
            .populate({ 
                path: 'user_id', 
                select: 'firstName lastName email phoneNumber' 
            });

        if (!room) {
            return res.status(404).send({ message: 'Room not found' });
        }

        // Convert Equipement paths to full URLs
        const equipementList = room.Equipement.map(equip => ({
            ...equip.toObject(),
            path: equip.path ? `http://localhost:3003/${equip.path.replace("\\", "/")}` : null // Check if path exists
        }));

        // Convert photos paths to full URLs
        const photoList = room.photos.map(photo => 
            photo.path ? `http://localhost:3003/${photo.path.replace("\\", "/")}` : null // Check if path exists
        );

        res.status(200).json({
            success: true,
            data: {
                ...room.toObject(),
                Equipement: equipementList,
                photos: photoList
            }
        });

    } catch (err) {
        if (err.name === 'CastError') {
            return res.status(400).send({ message: 'Invalid room ID format' });
        }
        res.status(500).send({
            message: 'Server error',
            error: err.message
        });
    }
};





module.exports = { getRoombyUserId, CreateRoom, updateRoom, deleteRoom, getAllRooms, filter, search,
    usersWithRoom,getRoomById,incrementOccupants,decrementOccupants,archiveRoom }