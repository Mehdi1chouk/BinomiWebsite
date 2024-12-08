const nodemailer = require('nodemailer');

exports.transporter = nodemailer.createTransport({ // transpoter hiya variable
    service: 'gmail',
    auth: {
        user: 'mehdichouk.tn@gmail.com',
        pass: 'tjlfxjjumoroesxb'
    },
    secure: false, // use SSL
    port: 25, // port for secure SMTP

    tls: {
        rejectUnauthorized: false
    }
});