const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// A phone photo lands here raw — often 3-8MB straight off the camera — and
// then sits on disk forever (nothing else in this app shrinks it). Resizing
// to what the UI actually displays and re-encoding as JPEG cuts that by
// roughly 70-90% with no visible quality loss, which directly shrinks the
// same disk-growth problem the orphaned-file cleanup protects against.
//
// Always re-encodes to JPEG regardless of the original format, so the
// returned path's extension may differ from the input's (e.g. a .png
// becomes .jpg) — callers must use the returned path, not the original one.
// Sharp can't safely read and write the same file in one pipeline, so this
// writes to a temp file and renames it into place, then removes the
// original if its extension changed.
const compressImage = async (filePath, { maxDimension = 1600, quality = 80 } = {}) => {
    const targetPath = filePath.replace(/\.[^./\\]+$/, '.jpg');
    const tmpPath = `${targetPath}.${Date.now()}.tmp`;

    await sharp(filePath)
        .rotate() // apply EXIF orientation before it gets stripped
        .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toFile(tmpPath);

    await fs.promises.rename(tmpPath, targetPath);

    if (path.resolve(targetPath) !== path.resolve(filePath)) {
        await fs.promises.unlink(filePath).catch(() => {});
    }

    return targetPath;
};

module.exports = { compressImage };
