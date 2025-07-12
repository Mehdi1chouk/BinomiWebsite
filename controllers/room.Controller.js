const RoomModel = require("../models/Room.model")
const UserModel = require("../models/User.model")
//const { decodeRoomId } = require("../utils/hashids");
const crypto = require('crypto');
// Secret key for encoding/decoding (store this in environment variables in production)
const SECRET_KEY = '52937680';


const encodeRoomId = (roomId) => {
    const cipher = crypto.createCipher('aes192', SECRET_KEY);
    let encrypted = cipher.update(roomId.toString(), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
};

// Function to decode room ID
const decodeRoomId = (encodedId) => {
    try {
        const decipher = crypto.createDecipher('aes192', SECRET_KEY);
        let decrypted = decipher.update(encodedId, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        throw new Error('Invalid room ID');
    }
};

const getRoombyUserId = async(req, res) => {
    try {
        let list = await RoomModel.find({ user_id: req.user._id }).populate({ 
            path: 'user_id', 
            select: 'firstName lastName' 
        });
        
        // Encode the room IDs before sending response
        const encodedList = list.map(room => ({
            ...room._doc,
            _id: encodeRoomId(room._id), // Encode the room ID
        }));
        
        res.send(encodedList);
    } catch (error) {
        res.status(500).send({ message: 'Error fetching rooms', error: error.message });
    }
};


const getAllRooms = async (req, res) => {
    try {
        let RoomsList = await RoomModel.find();

        // Convert the rooms data and encode IDs
        RoomsList = RoomsList.map(room => ({
            ...room._doc,
            _id: encodeRoomId(room._id), // Encode the ID
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
        // Manual validation before creating the room
        const validationErrors = [];
        
        // Required fields validation
        const requiredFields = ['type', 'etat', 'disponibilite', 'region', 'ville', 'quartier', 'price', 'cautionnement', 'nombreDeColocation', 'description', 'chambres', 'lits', 'sdb'];
        
        requiredFields.forEach(field => {
            if (!req.body[field] || req.body[field] === '') {
                validationErrors.push(`${field} est requis`);
            }
        });
        
        // Type-specific validation
        if (req.body.type) {
            if (['appartement', 'chambre partagé'].includes(req.body.type)) {
                if (!req.body.etage || req.body.etage <= 0) {
                    validationErrors.push('L\'étage est requis pour les appartements et chambres partagées');
                }
                if (!req.body.assensceur || !['avec', 'sans'].includes(req.body.assensceur)) {
                    validationErrors.push('L\'ascenseur (avec/sans) est requis pour les appartements et chambres partagées');
                }
            }
            
            if (['maison', 'villa'].includes(req.body.type)) {
                if (!req.body.garage || !['avec', 'sans'].includes(req.body.garage)) {
                    validationErrors.push('Le garage (avec/sans) est requis pour les maisons et villas');
                }
            }
        }
        
        // Photos validation
        if (!req.files || !req.files.photos || 
            (Array.isArray(req.files.photos) && req.files.photos.length === 0)) {
            validationErrors.push('Au moins une photo est requise');
        }
        
        // Price validation
        if (req.body.price && (isNaN(req.body.price) || Number(req.body.price) <= 0)) {
            validationErrors.push('Le prix doit être un nombre supérieur à 0');
        }
        
        // Cautionnement validation
        if (req.body.cautionnement && (isNaN(req.body.cautionnement) || Number(req.body.cautionnement) < 0)) {
            validationErrors.push('Le cautionnement doit être un nombre supérieur ou égal à 0');
        }
        
        // Description validation
        if (req.body.description && req.body.description.length < 10) {
            validationErrors.push('La description doit contenir au moins 10 caractères');
        }
        
        // Capacity validation
        const capacityFields = ['chambres', 'lits', 'sdb', 'nombreDeColocation'];
        capacityFields.forEach(field => {
            if (req.body[field] && (isNaN(req.body[field]) || Number(req.body[field]) < 1)) {
                validationErrors.push(`${field} doit être un nombre supérieur à 0`);
            }
        });
        
        // Date validation
        if (req.body.disponibilite) {
            const availabilityDate = new Date(req.body.disponibilite);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (availabilityDate < today) {
                validationErrors.push('La date de disponibilité doit être aujourd\'hui ou dans le futur');
            }
        }
        
        // If there are validation errors, return them
        if (validationErrors.length > 0) {
            return res.status(400).json({
                message: 'Erreurs de validation',
                errors: validationErrors
            });
        }
        
        // Create the room with the basic form data
        let Room = new RoomModel({
            ...req.body,
            user_id: req.user._id,
            lastOwner: req.user._id
        });
        
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
        
        // Save the room (this will trigger Mongoose validation as well)
        await Room.save();
        
        res.status(201).json({
            message: 'Logement créé avec succès',
            room: Room
        });
        
    } catch (err) {
        console.error('Error saving room:', err);
        
        // Handle Mongoose validation errors
        if (err.name === 'ValidationError') {
            const validationErrors = Object.values(err.errors).map(error => error.message);
            return res.status(400).json({
                message: 'Erreurs de validation',
                errors: validationErrors
            });
        }
        
        res.status(422).json({
            message: 'Échec de la sauvegarde du logement',
            error: err.message
        });
    }
};



const incrementOccupants = async (req, res) => {
    try {
        // Decode the room ID first
        const actualRoomId = decodeRoomId(req.params.id);

        const updatedRoom = await RoomModel.findByIdAndUpdate(
            actualRoomId, // Use decoded ID
            { $inc: { currentOccupants: 1 } },
            { new: true }
        );

        if (!updatedRoom) {
            return res.status(404).json({ message: 'Room not found' });
        }

        res.status(200).json(updatedRoom);
    } catch (err) {
        if (err.message === 'Invalid room ID') {
            return res.status(400).json({ message: 'Invalid room ID format' });
        }
        console.error('Error incrementing occupants:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};





const decrementOccupants = async (req, res) => {
    try {
        // Decode the room ID first
        const actualRoomId = decodeRoomId(req.params.id);

        const updatedRoom = await RoomModel.findByIdAndUpdate(
            actualRoomId, // Use decoded ID
            { $inc: { currentOccupants: -1 } },
            { new: true }
        );

        if (!updatedRoom) {
            return res.status(404).json({ message: 'Room not found' });
        }

        // Ensure occupants don't go below 0
        if (updatedRoom.currentOccupants < 0) {
            updatedRoom.currentOccupants = 0;
            await updatedRoom.save();
        }

        res.status(200).json(updatedRoom);
    } catch (err) {
        if (err.message === 'Invalid room ID') {
            return res.status(400).json({ message: 'Invalid room ID format' });
        }
        console.error('Error decrementing occupants:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};


const updateRoom = async (req, res) => {
    try {
        // Decode the room ID first
        const actualRoomId = decodeRoomId(req.params.id);
        
        // Get the current room to compare what changed
        const existingRoom = await RoomModel.findById(actualRoomId);
        
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
            updateData.etage = 0;
        } else if (updateData.etage !== undefined) {
            updateData.etage = Number(updateData.etage);
        }

        // Ensure `user_id` is correctly formatted
        if (req.body.user_id && typeof req.body.user_id === "object") {
            updateData.user_id = req.body.user_id._id;
        }

        // Handle equipment data
        if (req.body.selectedEquipment) {
            try {
                const selectedEquipment = JSON.parse(req.body.selectedEquipment);
                updateData.Equipement = selectedEquipment.map(item => ({
                    name: item.name,
                    path: item.icon
                }));
                delete updateData.selectedEquipment;
            } catch (parseError) {
                console.error('Error parsing equipment data:', parseError);
            }
        }

        // Handle photos update logic
        updateData.photos = [];

        // Case 1: Keep some/all existing photos
        if (req.body.keepPhotos) {
            try {
                const keepPhotoUrls = JSON.parse(req.body.keepPhotos);
                console.log("Photos to keep:", keepPhotoUrls);
                
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

        delete updateData.keepPhotos;

        // Update the room using the actual (decoded) room ID
        const result = await RoomModel.findByIdAndUpdate(
            actualRoomId,
            updateData,
            { new: true, runValidators: true }
        );

        res.send(result);
    } catch (err) {
        if (err.message === 'Invalid room ID') {
            return res.status(400).send({ message: 'Invalid room ID format' });
        }
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



const deleteRoom = async (req, res) => {
    try {
        // Decode the room ID first
        const actualRoomId = decodeRoomId(req.params.id);

        const deletedRoom = await RoomModel.findByIdAndDelete(actualRoomId);

        if (!deletedRoom) {
            return res.status(404).json({ message: 'Room not found' });
        }

        res.status(200).json({ message: 'Room deleted successfully' });
    } catch (err) {
        if (err.message === 'Invalid room ID') {
            return res.status(400).json({ message: 'Invalid room ID format' });
        }
        console.error('Error deleting room:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
const archiveRoom = async (req, res) => {
    try {
        // Decode the room ID first
        const actualRoomId = decodeRoomId(req.params.id);
        
        console.log('req.user:', req.user);
        const userId = req.user?._id;

        const result = await RoomModel.findByIdAndUpdate(
            actualRoomId, // Use decoded ID
            {
                $unset: { user_id: "" },
                $set: { lastOwner: userId || null }
            },
            { new: true }
        );

        if (!result) return res.status(404).send({ message: "Room not found" });

        res.send({ message: "Room archived", room: result });
    } catch (error) {
        if (error.message === 'Invalid room ID') {
            return res.status(400).send({ message: 'Invalid room ID format' });
        }
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
        // Decode the room ID
        const actualRoomId = decodeRoomId(req.params.id);
        
        const room = await RoomModel.findById(actualRoomId)
            .populate({
                path: 'user_id',
                select: 'firstname lastname email phoneNumber'
            });

        if (!room) {
            return res.status(404).send({ message: 'Room not found' });
        }

        // Convert Equipement paths to full URLs
        const equipementList = room.Equipement.map(equip => ({
            ...equip.toObject(),
            path: equip.path ? `http://localhost:3003/${equip.path.replace("\\", "/")}` : null
        }));

        // Convert photos paths to full URLs
        const photoList = room.photos.map(photo =>
            photo.path ? `http://localhost:3003/${photo.path.replace("\\", "/")}` : null
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
        if (err.message === 'Invalid room ID') {
            return res.status(400).send({ message: 'Invalid room ID format' });
        }
        if (err.name === 'CastError') {
            return res.status(400).send({ message: 'Invalid room ID format' });
        }
        res.status(500).send({
            message: 'Server error',
            error: err.message
        });
    }
};



const getCurrentUserRoom = async (req, res) => {
    try {
        const room = await RoomModel.findOne({ user_id: req.user._id })
            .populate({
                path: 'user_id',
                select: 'firstname lastname email phoneNumber'
            });

        if (!room) {
            return res.status(404).send({ message: 'Room not found' });
        }

        // Convert Equipement paths to full URLs
        const equipementList = room.Equipement.map(equip => ({
            ...equip.toObject(),
            path: equip.path ? `http://localhost:3003/${equip.path.replace("\\", "/")}` : null
        }));

        // Convert photos paths to full URLs
        const photoList = room.photos.map(photo =>
            photo.path ? `http://localhost:3003/${photo.path.replace("\\", "/")}` : null
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
        res.status(500).send({
            message: 'Server error',
            error: err.message
        });
    }
};

const incrementCurrentUserOccupants = async (req, res) => {
    try {
        const updatedRoom = await RoomModel.findOneAndUpdate(
            { user_id: req.user._id }, // Find by user ID instead of room ID
            { $inc: { currentOccupants: 1 } },
            { new: true }
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

const decrementCurrentUserOccupants = async (req, res) => {
    try {
        const updatedRoom = await RoomModel.findOneAndUpdate(
            { user_id: req.user._id }, // Find by user ID instead of room ID
            { $inc: { currentOccupants: -1 } },
            { new: true }
        );

        if (!updatedRoom) {
            return res.status(404).json({ message: 'Room not found' });
        }

        // Ensure occupants don't go below 0
        if (updatedRoom.currentOccupants < 0) {
            updatedRoom.currentOccupants = 0;
            await updatedRoom.save();
        }

        res.status(200).json(updatedRoom);
    } catch (err) {
        console.error('Error decrementing occupants:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const archiveCurrentUserRoom = async (req, res) => {
    try {
        console.log('req.user:', req.user);
        const userId = req.user?._id;

        const result = await RoomModel.findOneAndUpdate(
            { user_id: userId }, // Find by user ID instead of room ID
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


module.exports = { getRoombyUserId, CreateRoom, updateRoom, deleteRoom, getAllRooms, filter, search,
    usersWithRoom,incrementOccupants,decrementOccupants,archiveRoom,getRoomById,encodeRoomId,decodeRoomId,
archiveCurrentUserRoom,decrementCurrentUserOccupants ,incrementCurrentUserOccupants,getCurrentUserRoom}
    