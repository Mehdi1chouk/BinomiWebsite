const UserModel = require('../models/User.model');
const RoomModel = require('../models/Room.model')
const { encodeRoomId } = require("../utils/hashids");
const { API_BASE_URL } = require('../utils/apiBaseUrl');
const { deleteUploadedFile } = require('../utils/deleteUploadedFile');
const { compressImage } = require('../utils/compressImage');
const jwt = require('jsonwebtoken');

let UsersList = [];
const fs = require('fs');
const path = require('path');

const resolvePhotoUrl = (photo) => (photo ? `${API_BASE_URL}/${photo.replace(/\\/g, '/')}` : null);

// A user can be linked to a room either as its owner (user_id) or as
// someone who accepted a 'binome' proposal into it (occupants[]) — both
// cases need to resolve to the same room/co-occupants info so the browse
// list and its "en colocation avec X" indicator work the same for either
// role. The indicator (and its co-occupant list) only shows while the room
// still has open spots: once full there's no one left to recruit.
const EMPTY_ROOM_INFO = { roomId: null, coOccupants: [], roomSpotsLeft: null, isRoomOwner: false };

const getUserRoomInfo = async (userId) => {
    const room = await RoomModel.findOne({
        $or: [{ user_id: userId }, { occupants: userId }]
    })
        .select('user_id occupants nombreDeColocation')
        .populate('user_id', 'firstname lastname photo')
        .populate('occupants', 'firstname lastname photo');

    if (!room) {
        return EMPTY_ROOM_INFO;
    }

    const isFull = room.occupants.length >= room.nombreDeColocation;
    let coOccupants = [];
    if (!isFull && room.occupants.length > 0) {
        const members = room.user_id ? [room.user_id, ...room.occupants] : [...room.occupants];
        coOccupants = members
            .filter((member) => member._id.toString() !== userId.toString())
            .map((member) => ({
                _id: member._id,
                firstname: member.firstname,
                lastname: member.lastname,
                photo: resolvePhotoUrl(member.photo)
            }));
    }

    return {
        roomId: room._id,
        coOccupants,
        roomSpotsLeft: Math.max(room.nombreDeColocation - room.occupants.length, 0),
        // An occupant/binôme is linked to the same room (hence the same
        // roomId, co-occupants and spots-left above — all needed so their
        // card can still show "en colocation avec X" and link to the real
        // owner), but only the owner can actually manage this room or
        // receive new binôme proposals. Card UI that implies otherwise
        // (the house icon, the capacity readout) should only show for them.
        isRoomOwner: room.user_id?._id.toString() === userId.toString()
    };
};

// Bulk version of getUserRoomInfo: one query for every user in the list
// instead of one query per user. Browse/filter lists can run into the
// thousands, and firing a DB round-trip per row for room info doesn't scale
// — this fetches every relevant room in a single query and derives each
// user's info from an in-memory map instead.
const getRoomInfoMapForUsers = async (userIds) => {
    const ids = userIds.map((id) => id.toString());
    const rooms = await RoomModel.find({
        $or: [{ user_id: { $in: ids } }, { occupants: { $in: ids } }]
    })
        .select('user_id occupants nombreDeColocation')
        .populate('user_id', 'firstname lastname photo')
        .populate('occupants', 'firstname lastname photo')
        .lean();

    const map = new Map();
    for (const room of rooms) {
        const isFull = room.occupants.length >= room.nombreDeColocation;
        const members = room.user_id ? [room.user_id, ...room.occupants] : [...room.occupants];
        const linkedIds = new Set(members.map((member) => member._id.toString()));

        const ownerId = room.user_id?._id?.toString() ?? null;

        for (const memberId of linkedIds) {
            let coOccupants = [];
            if (!isFull && room.occupants.length > 0) {
                coOccupants = members
                    .filter((member) => member._id.toString() !== memberId)
                    .map((member) => ({
                        _id: member._id,
                        firstname: member.firstname,
                        lastname: member.lastname,
                        photo: resolvePhotoUrl(member.photo)
                    }));
            }

            map.set(memberId, {
                roomId: room._id,
                coOccupants,
                roomSpotsLeft: Math.max(room.nombreDeColocation - room.occupants.length, 0),
                isRoomOwner: ownerId === memberId
            });
        }
    }

    return map;
};




const getAll = async (req, res) => {
    try {
      // Unverified viewers can browse everyone (verified and unverified) —
      // they just can't filter, message, or see house details, per the
      // requireVerified gates elsewhere. Verified viewers only see verified
      // profiles, so a lapsed/unverified account (e.g. after a photo change)
      // drops out of their feed immediately.
      const viewer = await UserModel.findById(req.user._id).select('isVerified');
      const query = { role: { $ne: 'admin' }, isBanned: { $ne: true }, isHidden: { $ne: true } };
      if (viewer?.isVerified) {
        query.isVerified = true;
      }

      // Excludes password/resetKey/tokenVersion — this was previously a
      // plain find() with no projection, sending every user's bcrypt hash
      // (and active password-reset keys) to every other logged-in user on
      // the single most frequently-hit endpoint in the app. Confirmed live
      // before this fix. The 300 cap isn't true pagination (the home feed
      // still needs the whole matched pool at once for client-side
      // preference sorting and the swipe carousel) — it's a ceiling so the
      // query/payload size can't grow without bound as the user base does;
      // revisit with real pagination if that ever actually gets reached.
      const usersList = await UserModel.find(query)
        .select('-password -resetKey -resetTimeout -tokenVersion -__v')
        .limit(300)
        .lean();

      const roomInfoMap = await getRoomInfoMapForUsers(usersList.map((user) => user._id));
      const usersWithRooms = usersList.map((user) => ({
        ...user,
        photo: resolvePhotoUrl(user.photo),
        ...(roomInfoMap.get(user._id.toString()) ?? EMPTY_ROOM_INFO)
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
  

// CreateUser/`POST /users` was removed entirely rather than fixed: it had no
// auth, no field whitelist (`new UserModel(req.body)` — anyone could set
// their own role to 'admin'), and never hashed the password at all. It was
// never called by the frontend (the real signup flow is /register, which
// does all of this correctly) — a forgotten duplicate, not a feature.

// Fields a user may edit on their own profile through this route. Anything
// security-sensitive (role, isVerified, isBanned, tokenVersion, password,
// email, isHidden) is deliberately excluded — those have their own
// dedicated, properly-guarded endpoints (verification/ban via admin routes,
// password via updatePassword, visibility via toggleVisibility).
const USER_EDITABLE_FIELDS = ['governorate', 'city', 'budget', 'profession', 'workplace'];

const updateUser = async (req, res) => {
    try {
        // Previously this route only checked verifytoken — any authenticated
        // user could PUT to ANY user id, and the whole request body was
        // spread straight into the update with no field whitelist. That
        // meant a user could set role/isVerified/isBanned on their own
        // account (instant admin self-promotion) or edit someone else's
        // profile outright. Same ownership rule deleteUser already enforces.
        if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to update this account' });
        }

        // Find the user first
        const user = await UserModel.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const updatedData = {};
        for (const field of USER_EDITABLE_FIELDS) {
            if (req.body[field] !== undefined) updatedData[field] = req.body[field];
        }

        // Only update photo if a new one is provided
        if (req.files?.photo) {
            // Remove the old profile image if it exists
            if (user.photo) {
                const oldImagePath = path.join(__dirname, '../', user.photo);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }

            // Save new image path — the previous face verification (if any)
            // was tied to the OLD photo, so it no longer proves anything
            // about this one.
            // A failed compression (e.g. an unsupported format) shouldn't
            // block the profile update — fall back to the raw upload.
            updatedData.photo = await compressImage(req.files.photo.path, { maxDimension: 800 }).catch(() => req.files.photo.path);
            updatedData.isVerified = false;
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

// Self-service "pause my search" toggle — only the account owner, and only
// once verified (an unverified profile is already filtered out of verified
// viewers' feeds, and still shown to unverified ones regardless, so hiding
// it wouldn't mean anything consistent until verification exists).
const toggleVisibility = async (req, res) => {
    try {
        if (req.user._id.toString() !== req.params.id) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this account' });
        }

        const user = await UserModel.findById(req.params.id).select('isVerified isHidden');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        if (!user.isVerified) {
            return res.status(403).json({ success: false, message: 'Vérifiez votre profil avant de pouvoir le masquer.' });
        }

        user.isHidden = !!req.body.isHidden;
        await user.save();

        res.status(200).json({ success: true, isHidden: user.isHidden });
    } catch (err) {
        res.status(422).json({
            success: false,
            message: 'Error updating visibility',
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

        // An unverified profile is unreachable to VERIFIED viewers (matches
        // them never seeing it in the list either), but stays reachable to
        // unverified viewers — who see everyone — and to its own owner.
        const isSelf = req.user?._id?.toString() === req.params.id;
        if (!isSelf && !user.isVerified) {
            const viewer = await UserModel.findById(req.user._id).select('isVerified');
            if (viewer?.isVerified) {
                return res.status(404).send({ message: 'User not found' });
            }
        }

        // Format photo URL
        if (user.photo) {
            user.photo = `${API_BASE_URL}/${user.photo.replace(/\\/g, "/")}`;
        }

        // Find Room by User ID
        const room = await RoomModel.findOne({ user_id: req.params.id })
                                    .select('type etat region ville price user_id nombreDeColocation currentOccupants')
                                    .lean();




        const archivedRooms = await RoomModel.find({ user_id: null, lastOwner: req.params.id })  //new
        .select('type region ville price nombreDeColocation currentOccupants')                    //new
        .lean();                                                                                 //new


        // Is this person already someone else's occupant (binôme)? Relevant
        // only when viewing your own profile — it's what gates whether
        // "Ajouter un logement" makes sense (a second household would be
        // meaningless while you're already housed as a binôme).
        let binomeOwner = null;
        if (isSelf && !room) {
            const occupiedRoom = await RoomModel.findOne({ occupants: req.params.id })
                .populate({ path: 'user_id', select: 'firstname lastname' })
                .lean();
            if (occupiedRoom?.user_id) {
                binomeOwner = {
                    firstname: occupiedRoom.user_id.firstname,
                    lastname: occupiedRoom.user_id.lastname
                };
            }
        }

        user.room = room || null; // Add the room data to the user object
         user.archivedRooms = archivedRooms;                                                   //new
        user.binomeOwner = binomeOwner;

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

    let query = { role: { $ne: 'admin' }, isBanned: { $ne: true }, isVerified: true, isHidden: { $ne: true } };

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

    // Fetch users with basic filters — same password/resetKey exclusion and
    // safety cap as getAll above, and for the same reason: this had no
    // projection at all before, so every filtered-search result included
    // every matched user's password hash.
    let filteredUsers = await UserModel.find(query)
      .select('-password -resetKey -resetTimeout -tokenVersion -__v')
      .limit(300);

    // Apply room-based filters and transform photo URLs
    const applyRoomFilters = async (users) => {
      const roomInfoMap = await getRoomInfoMapForUsers(users.map(user => user._id));
      return users.map(user => ({
        ...user.toObject(), // Convert Mongoose document to plain JavaScript object
        photo: resolvePhotoUrl(user.photo),
        ...(roomInfoMap.get(user._id.toString()) ?? EMPTY_ROOM_INFO)
      }));
    };

    // One query for every candidate's own room instead of one query per user.
    const getOwnRoomMap = async (users) => {
      const rooms = await RoomModel.find({ user_id: { $in: users.map(user => user._id) } })
        .select('user_id')
        .lean();
      return new Map(rooms.map(room => [room.user_id.toString(), room]));
    };

    const filterByRoom = async (users, hasRoom) => {
      const ownRoomMap = await getOwnRoomMap(users);
      return users.filter(user => ownRoomMap.has(user._id.toString()) === hasRoom);
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
      }).select('_id').lean();
      const roomIds = new Set(rooms.map(room => room._id.toString()));

      const ownRoomMap = await getOwnRoomMap(filteredUsers);
      filteredUsers = filteredUsers.filter(user => {
        const room = ownRoomMap.get(user._id.toString());
        return !room || roomIds.has(room._id.toString());
      });
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
  



const deleteUser = async (req, res) => {
    try {
        // This route had no auth check at all before — anyone could delete
        // any account by guessing/enumerating an id. Only the account owner
        // or an admin may delete it now.
        if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin') {
            return res.status(403).send({ message: 'Not authorized to delete this account' });
        }

        const user = await UserModel.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).send({ message: 'User not found' });
        }

        deleteUploadedFile(user.photo);

        res.send({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(422).send(err);
    }
}


module.exports = { getAll, updateUser, deleteUser, filterUser, getUserById, toggleVisibility }