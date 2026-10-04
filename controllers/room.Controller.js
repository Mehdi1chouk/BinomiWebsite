const RoomModel = require("../models/Room.model")
const UserModel = require("../models/User.model")
const { API_BASE_URL } = require("../utils/apiBaseUrl");
const { deleteUploadedFiles } = require("../utils/deleteUploadedFile");
const { compressImage } = require("../utils/compressImage");
//const { decodeRoomId } = require("../utils/hashids");
const crypto = require('crypto');
// Secret key for encoding/decoding (store this in environment variables in production)
const SECRET_KEY = '52937680';
const KEY = crypto.createHash('sha256').update(SECRET_KEY).digest().subarray(0, 24);
const IV_LENGTH = 16;

const encodeRoomId = (roomId) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-192-cbc', KEY, iv);
    let encrypted = cipher.update(roomId.toString(), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + encrypted;
};

// Function to decode room ID
const decodeRoomId = (encodedId) => {
    try {
        const ivHex = encodedId.slice(0, IV_LENGTH * 2);
        const encrypted = encodedId.slice(IV_LENGTH * 2);
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-192-cbc', KEY, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
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
        // Unbounded before: RoomModel.find() with no limit pulled the entire
        // collection into memory on every call. Paginated the same way as the
        // rest of the app's list endpoints so this stays cheap as listings grow.
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const skip = (page - 1) * limit;

        const [RoomsList, total] = await Promise.all([
            RoomModel.find().sort({ _id: -1 }).skip(skip).limit(limit),
            RoomModel.countDocuments()
        ]);

        // Convert the rooms data and encode IDs
        const data = RoomsList.map(room => ({
            ...room._doc,
            _id: encodeRoomId(room._id), // Encode the ID
            photos: room.photos.map(photo => `${API_BASE_URL}/${photo.path.replace("\\", "/")}`),
            Equipement: room.Equipement.map(equip => ({
                ...equip,
                path: `${API_BASE_URL}/${equip.path.replace("\\", "/")}`
            }))
        }));

        res.send({
            success: true,
            data,
            page,
            limit,
            total,
            hasMore: skip + data.length < total
        });
    } catch (err) {
        res.status(500).send({ message: 'Error retrieving rooms', error: err.message });
    }
};



const CreateRoom = async (req, res) => {
    try {
        // One housing situation at a time: block if the user already owns an
        // active room, or is already someone else's occupant (binôme) — in
        // either case a new listing would be meaningless/inconsistent.
        const existingOwnRoom = await RoomModel.findOne({ user_id: req.user._id });
        if (existingOwnRoom) {
            return res.status(409).json({ message: 'Vous avez déjà un logement actif.' });
        }

        const occupiedRoom = await RoomModel.findOne({ occupants: req.user._id });
        if (occupiedRoom) {
            return res.status(409).json({ message: 'Vous êtes déjà le binôme de quelqu\'un — vous ne pouvez pas ajouter de logement tant que vous êtes colocataire.' });
        }

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
            const uploadedPhotos = Array.isArray(req.files.photos) ? req.files.photos : [req.files.photos];

            // A compression failure on one photo shouldn't block the whole
            // listing — fall back to that photo's raw upload.
            Room.photos = await Promise.all(uploadedPhotos.map(async (photo) => ({
                path: (await compressImage(photo.path).catch(() => photo.path)).replace("\\", "/"),
                name: photo.filename || photo.originalname
            })));
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



// incrementOccupants/decrementOccupants (the `/room/:id/...` routes) were
// removed: they had no auth check at all, so anyone could inflate or
// deflate any room's occupant count. The actually-used, properly-guarded
// equivalents are incrementCurrentUserOccupants/decrementCurrentUserOccupants
// below, which operate on "the logged-in user's own room" instead of an
// arbitrary id from the URL.



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
                    const photoUrl = `${API_BASE_URL}/${photo.path.replace("\\", "/")}`;
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

            // A compression failure on one photo shouldn't block the update
            // — fall back to that photo's raw upload.
            const newPhotoObjects = await Promise.all(newPhotos.map(async (photo) => ({
                path: (await compressImage(photo.path).catch(() => photo.path)).replace("\\", "/"),
                name: photo.filename || photo.originalname
            })));

            updateData.photos = [...updateData.photos, ...newPhotoObjects];
            console.log("Added new photos:", newPhotoObjects);
        }

        delete updateData.keepPhotos;

        // Any existing photo not carried over into the final list was
        // dropped by this update — its file would otherwise sit on disk
        // forever with nothing left pointing to it.
        const keptPaths = new Set(updateData.photos.map(photo => photo.path));
        const removedPhotos = existingRoom.photos.filter(photo => !keptPaths.has(photo.path));

        // Update the room using the actual (decoded) room ID
        const result = await RoomModel.findByIdAndUpdate(
            actualRoomId,
            updateData,
            { new: true, runValidators: true }
        );

        deleteUploadedFiles(removedPhotos);

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
        const userId = req.user._id.toString();

        const room = await RoomModel.findById(actualRoomId);
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }

        // Either the current owner (active room) or the last owner (an
        // already-archived room, which has no user_id anymore) may delete it.
        const isOwner = room.user_id?.toString() === userId;
        const isLastOwner = room.lastOwner?.toString() === userId;
        if (!isOwner && !isLastOwner) {
            return res.status(403).json({ message: 'Not authorized to delete this room' });
        }

        // Only checked for the active room: an archived one's occupants list
        // is stale leftover data (reactivateRoom always resets it to [] on
        // reactivation, and nothing elsewhere treats an archived room's
        // occupants as a live relationship), so it shouldn't block deleting it.
        // Deleting the room out from under a current binome would silently
        // orphan their housing with no way for them to find out — make the
        // owner remove them first instead (same "Retirer comme binôme" flow
        // this already offers).
        if (isOwner && room.occupants && room.occupants.length > 0) {
            return res.status(409).json({
                message: 'Vous avez un binôme dans ce logement. Retirez-le avant de supprimer ce logement.'
            });
        }

        await RoomModel.findByIdAndDelete(actualRoomId);
        deleteUploadedFiles(room.photos);

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
        const userId = req.user._id.toString();

        const room = await RoomModel.findById(actualRoomId);
        if (!room) return res.status(404).send({ message: "Room not found" });

        if (room.user_id?.toString() !== userId) {
            return res.status(403).send({ message: 'Not authorized to archive this room' });
        }

        const result = await RoomModel.findByIdAndUpdate(
            actualRoomId, // Use decoded ID
            {
                $unset: { user_id: "" },
                $set: { lastOwner: userId }
            },
            { new: true }
        );

        res.send({ message: "Room archived", room: result });
    } catch (error) {
        if (error.message === 'Invalid room ID') {
            return res.status(400).send({ message: 'Invalid room ID format' });
        }
        console.error('Archive error:', error);
        res.status(500).send({ error: "Failed to archive room" });
    }
};

// A previously-archived room (user_id unset, lastOwner still pointing at the
// original owner) can be brought back — but only by that same owner, and
// only if they don't already have another active room (the app assumes one
// active listing per user everywhere else). Comes back empty: any prior
// occupants are cleared, since reactivating means starting the search over,
// not resuming the old colocation.
const reactivateRoom = async (req, res) => {
    try {
        const actualRoomId = decodeRoomId(req.params.id);
        const userId = req.user._id.toString();

        const room = await RoomModel.findById(actualRoomId);
        if (!room) return res.status(404).send({ message: 'Room not found' });

        if (room.user_id) {
            return res.status(409).send({ message: 'Ce logement est déjà actif' });
        }

        if (room.lastOwner?.toString() !== userId) {
            return res.status(403).send({ message: 'Not authorized to reactivate this room' });
        }

        const activeRoom = await RoomModel.findOne({ user_id: userId });
        if (activeRoom) {
            return res.status(409).send({ message: 'Vous avez déjà un logement actif. Archivez-le avant d\'en réactiver un autre.' });
        }

        const result = await RoomModel.findByIdAndUpdate(
            actualRoomId,
            {
                $set: { user_id: userId, currentOccupants: 0, occupants: [] }
            },
            { new: true }
        );

        res.send({ message: 'Logement réactivé', room: result });
    } catch (error) {
        if (error.message === 'Invalid room ID') {
            return res.status(400).send({ message: 'Invalid room ID format' });
        }
        console.error('Reactivate error:', error);
        res.status(500).send({ error: 'Failed to reactivate room' });
    }
};



// filter/search/usersWithRoom (the `/filter`, `/search/:text`, `/userRoom`
// routes) were removed entirely: none had any auth check, none were called
// by the frontend, and usersWithRoom/search both sent full raw user
// documents — including the hashed password field — to anyone, logged in or
// not. Confirmed live and exploitable before removal.

const getRoomById = async (req, res) => {
    try {
        // Decode the room ID
        const actualRoomId = decodeRoomId(req.params.id);
        
        const room = await RoomModel.findById(actualRoomId)
            .populate({
                path: 'user_id',
                select: 'firstname lastname'
            })
            // A room with no current owner (archived) should still show who
            // it belonged to on the details page instead of the
            // "Propriétaire" card just vanishing — see house-details.ts's
            // owner(), which falls back to this when user_id is unset.
            .populate({
                path: 'lastOwner',
                select: 'firstname lastname'
            })
            .populate({
                path: 'occupants',
                select: 'firstname lastname'
            });

        if (!room) {
            return res.status(404).send({ message: 'Room not found' });
        }

        // Convert Equipement paths to full URLs
        const equipementList = room.Equipement.map(equip => ({
            ...equip.toObject(),
            path: equip.path ? `${API_BASE_URL}/${equip.path.replace("\\", "/")}` : null
        }));

        // Convert photos paths to full URLs
        const photoList = room.photos.map(photo =>
            photo.path ? `${API_BASE_URL}/${photo.path.replace("\\", "/")}` : null
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
                select: 'firstname lastname email'
            });

        if (!room) {
            return res.status(404).send({ message: 'Room not found' });
        }

        // Convert Equipement paths to full URLs
        const equipementList = room.Equipement.map(equip => ({
            ...equip.toObject(),
            path: equip.path ? `${API_BASE_URL}/${equip.path.replace("\\", "/")}` : null
        }));

        // Convert photos paths to full URLs
        const photoList = room.photos.map(photo =>
            photo.path ? `${API_BASE_URL}/${photo.path.replace("\\", "/")}` : null
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
        const { occupantId } = req.body;

        const update = occupantId
            ? { $inc: { currentOccupants: -1 }, $pull: { occupants: occupantId } }
            : { $inc: { currentOccupants: -1 } };

        const updatedRoom = await RoomModel.findOneAndUpdate(
            { user_id: req.user._id }, // Find by user ID instead of room ID
            update,
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

        // The removed occupant has no other way of finding out they lost
        // their housing — same reasoning as the binome-accepted/contact-
        // accepted notifications in notification.Controller.js.
        if (occupantId) {
            const NotificationModel = require('../models/Notification.model');
            const { getIO } = require('../socketio');
            const { sendPushToUser } = require('../utils/sendPushNotification');
            const { API_BASE_URL } = require('../utils/apiBaseUrl');
            const resolvePhotoUrl = (photo) => (photo ? `${API_BASE_URL}/${photo.replace(/\\/g, '/')}` : null);

            const owner = await UserModel.findById(req.user._id).select('firstname photo');
            const removalNotification = new NotificationModel({
                sender: req.user._id,
                receiver: occupantId,
                message: `${owner?.firstname ?? 'Votre binôme'} vous a retiré comme binôme.`,
                type: 'binome-removed',
                status: 'refused'
            });
            await removalNotification.save();

            const io = getIO();
            io.to(occupantId.toString()).emit('receive_notification', {
                _id: removalNotification._id,
                sender: { _id: req.user._id, firstname: owner?.firstname, photo: resolvePhotoUrl(owner?.photo) },
                receiverId: occupantId,
                message: removalNotification.message,
                createdAt: removalNotification.createdAt,
                type: 'binome-removed'
            });

            sendPushToUser(occupantId, {
                title: 'Binôme retiré',
                body: removalNotification.message,
                url: '/app/notifications'
            }).catch(() => {});
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

// Tells the chat UI what button to show for a given other user: propose,
// pending (sent or received), already-binome, or nothing (no room owned).
const getBinomeStatus = async (req, res) => {
    try {
        const currentUserId = req.user._id;
        const { otherUserId } = req.params;
        const NotificationModel = require('../models/Notification.model');

        const [room, receiverRoom, receiverArchivedRoom, sentProposal, receivedProposal] = await Promise.all([
            RoomModel.findOne({ user_id: currentUserId }),
            RoomModel.findOne({ user_id: otherUserId }),
            // An archived room isn't gone — its owner can reactivate it any time
            // (see reactivateRoom). Proposing a binome while this exists would
            // let them reactivate later and end up both occupying a room AND
            // owning one, so this counts the same as still owning a room.
            RoomModel.findOne({ lastOwner: otherUserId, user_id: { $exists: false } }),
            NotificationModel.findOne({ sender: currentUserId, receiver: otherUserId, type: 'binome', status: 'pending' }),
            NotificationModel.findOne({ sender: otherUserId, receiver: currentUserId, type: 'binome', status: 'pending' })
        ]);
        const ownsRoom = !!room;
        const alreadyBinome = ownsRoom
            ? room.occupants.some((id) => id.toString() === otherUserId)
            : false;
        const roomFull = ownsRoom
            ? room.occupants.length >= room.nombreDeColocation
            : false;

        res.json({
            ownsRoom,
            alreadyBinome,
            roomFull,
            receiverOwnsRoom: !!receiverRoom,
            receiverHasArchivedRoom: !!receiverArchivedRoom,
            pendingProposalSent: !!sentProposal,
            pendingProposalReceived: !!receivedProposal,
            pendingProposalReceivedId: receivedProposal ? receivedProposal._id : null
        });
    } catch (error) {
        console.error('Error getting binome status:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
};


module.exports = { getRoombyUserId, CreateRoom, updateRoom, deleteRoom, getAllRooms,
    archiveRoom,reactivateRoom,getRoomById,encodeRoomId,decodeRoomId,
archiveCurrentUserRoom,decrementCurrentUserOccupants ,incrementCurrentUserOccupants,getCurrentUserRoom,getBinomeStatus}
