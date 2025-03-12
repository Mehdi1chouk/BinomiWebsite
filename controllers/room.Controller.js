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
        let Room = new RoomModel(req.body);

        if (req.files && req.files.photos) {
            Room.photos = req.files.photos.map(photo => ({
                path: photo.path.replace("\\", "/"), // Normalisation du chemin
                name: photo.name
            }));
        }

        if (req.files && req.files.Equipement) {
            Room.Equipement = req.files.Equipement.map(equip => ({
                path: equip.path.replace("\\", "/"),
                name: equip.name
            }));
        }

        Room.user_id = req.user._id;
        await Room.save();
        res.send(Room);
    } catch (err) {
        res.status(422).send(err);
    }
};




const updateRoom = (req, res) => {
    RoomModel.updateOne({ _id: req.params.id }, req.body)
        .then((result) => { res.send(result) })
        .catch((err) => { res.status(422).send(err) })
}



const deleteRoom = (req, res) => {
    RoomModel.deleteOne({ _id: req.params.id })
        .then(result => res.send(result))
        .catch(err => res.status(422).send(err))

}



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
            path: `http://localhost:3003/${equip.path.replace("\\", "/")}`
        }));

        // Convert photos paths to full URLs
        const photoList = room.photos.map(photo => 
            `http://localhost:3003/${photo.path.replace("\\", "/")}`
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





module.exports = { getRoombyUserId, CreateRoom, updateRoom, deleteRoom, getAllRooms, filter, search, usersWithRoom,getRoomById }