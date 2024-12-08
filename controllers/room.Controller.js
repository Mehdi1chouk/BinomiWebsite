const RoomModel = require("../models/Room.model")



const getAll = async(req, res) => {
    let list = await RoomModel.find({ user_id: req.user._id }).populate({ path: 'user_id', select: 'firstName lastName' });
    res.send(list)

}

const getAllRooms = async(req, res) => {
    console.log(req.ch)
    const RoomsList = await RoomModel.find()
    res.send(RoomsList)

}



const CreateRoom = async(req, res) => {
    try {
        let Room = new RoomModel(req.body)
        if (req.files && req.files.photos) {
            Room.photos = req.files.photos
        }
        if (req.files && req.files.Equipement) {
            Room.Equipement = req.files.Equipement
        }
        Room.user_id = req.user._id
        await Room.save()
        res.send(Room)
    } catch (err) {
        res.status(422).send(err)
    }
}



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

module.exports = { getAll, CreateRoom, updateRoom, deleteRoom, getAllRooms }