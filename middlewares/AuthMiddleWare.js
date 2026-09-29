const jwt = require('jsonwebtoken')
const UserModel = require('../models/User.model')

exports.verifytoken = async (req, res, next) => {
    let token = req.headers['authorization'] || req.headers['access'] || req.body.token;

    if (!token) {
       return res.status(403).send({ message: 'token required' });
    }
    if (req.headers['authorization']) {
        token = token.replace(/^Bearer\s+/, "");
    }
    //console.log(token);
    try {
        let decoded = jwt.verify(token, process.env.SECRET)

        // Role and ban status are looked up fresh from the DB on every
        // request (not trusted from the token payload) so a ban or role
        // change takes effect immediately, without waiting for the token
        // to expire or the user to log in again.
        const user = await UserModel.findById(decoded._id).select('role isBanned banReason tokenVersion isVerified');
        if (!user) {
            return res.status(401).send({ 'UnAuthorized': "Invalid Token" });
        }

        const tokenVersion = decoded.tokenVersion ?? 0;
        if (user.isBanned || tokenVersion !== user.tokenVersion) {
            return res.status(403).send({
                message: user.banReason || 'Votre compte a été banni.',
                banned: true
            });
        }

        req.user = { ...decoded, role: user.role, isVerified: user.isVerified };
        return next();
    } catch (err) {
        return res.status(401).send({ 'UnAuthorized': "Invalid Token" });
    }
}

exports.requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).send({ message: 'Accès administrateur requis' });
    }
    next();
}

exports.requireVerified = (req, res, next) => {
    if (!req.user?.isVerified) {
        return res.status(403).send({
            message: 'Cette fonctionnalité nécessite un profil vérifié.',
            requiresVerification: true
        });
    }
    next();
}


// const filterUser = async(req, res, next) => {
//     const filters = req.body;
//     const filteredUsers = UsersList.filter(user => {
//         let isValid = true;
//         for (key in filters) {
//             console.log(key, user[key], filters[key]);
//             isValid = isValid && user[key] == filters[key];
//         }
//         return isValid;
//     });
//     res.send(filteredUsers);
// };