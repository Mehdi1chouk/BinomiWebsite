const fs = require('fs');

// Deleting a room/user record used to leave its uploaded photo files behind
// on disk forever (UsersImages/RoomImages only ever grow). A missing file
// (already gone, moved, or never actually saved) is not an error — disk
// cleanup should never block the record delete/update it's attached to.
const deleteUploadedFile = (filePath) => {
    if (!filePath) return;
    fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error('Failed to delete uploaded file:', filePath, err.message);
        }
    });
};

const deleteUploadedFiles = (photos) => {
    if (!Array.isArray(photos)) return;
    photos.forEach((photo) => deleteUploadedFile(typeof photo === 'string' ? photo : photo?.path));
};

module.exports = { deleteUploadedFile, deleteUploadedFiles };
