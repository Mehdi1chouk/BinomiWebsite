const sharp = require('sharp');
const fs = require('fs');

// connect-multiparty saves whatever bytes arrive to disk under UsersImages/
// RoomImages regardless of content — a renamed .exe, .html or .php lands
// there with no complaint, and those folders are served back to any visitor.
// Decoding the file with sharp (which parses actual image data, not the
// filename or client-supplied Content-Type) is what actually proves "this is
// an image" before it's kept and served. Deletes the rejected file so it
// never lingers on disk.
const isValidImage = async (filePath) => {
  try {
    const metadata = await sharp(filePath).metadata();
    return !!metadata.format;
  } catch {
    return false;
  }
};

const rejectIfNotImage = async (filePath) => {
  if (await isValidImage(filePath)) return true;
  fs.unlink(filePath, () => {});
  return false;
};

module.exports = { isValidImage, rejectIfNotImage };
