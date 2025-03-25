const jwt = require('jsonwebtoken')
exports.verifytoken = (req, res, next) => {
    let token = req.headers['authorization'] || req.headers['access'] || req.body.token;

    if (!token) {
        res.status(403).send({ message: 'token required' });
    }
    if (req.headers['authorization']) {
        token = token.replace(/^Bearer\s+/, "");
    }
    //console.log(token);
    try {
        let decoded = jwt.verify(token, process.env.SECRET)
        req.user = decoded;
        return next();
    } catch (err) {
        return res.status(401).send({ 'UnAuthorized': "Invalid Token" });
    }


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