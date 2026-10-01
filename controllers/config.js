const nodemailer = require('nodemailer');

exports.transporter = nodemailer.createTransport({ // transpoter hiya variable
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    secure: false, // use SSL
    port: 25, // port for secure SMTP

    tls: {
        rejectUnauthorized: false
    }
});