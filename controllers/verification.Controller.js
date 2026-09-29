const UserModel = require('../models/User.model');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// The liveness challenge (blink detection) is verified client-side before
// this ever gets called — this endpoint's job is purely the face-match:
// does the just-captured live photo belong to the same person as the
// anchor (signup) photo.
exports.verifyFace = async (req, res) => {
  const livePath = req.files?.live?.path;

  try {
    if (!livePath) {
      return res.status(400).json({ message: 'Photo en direct requise' });
    }

    const user = await UserModel.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const anchorPath = path.join(__dirname, '../', user.photo);

    const form = new FormData();
    form.append('anchor', fs.createReadStream(anchorPath));
    form.append('live', fs.createReadStream(livePath));

    const response = await axios.post('http://127.0.0.1:5000/verify-face', form, {
      headers: form.getHeaders(),
    });

    const { match, similarity } = response.data;

    if (match) {
      user.isVerified = true;
      await user.save();
    }

    res.status(200).json({ match, similarity, isVerified: user.isVerified });
  } catch (error) {
    if (error.response?.status === 422) {
      return res.status(422).json({ message: error.response.data.message || 'Aucun visage détecté' });
    }
    console.error('Face verification error:', error.message);
    res.status(500).json({ message: 'Erreur lors de la vérification', error: error.message });
  } finally {
    if (livePath) {
      fs.unlink(livePath, () => {});
    }
  }
};
