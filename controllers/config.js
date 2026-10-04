const nodemailer = require('nodemailer');

exports.transporter = nodemailer.createTransport({ // transpoter hiya variable
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
    // Gmail's SMTP servers have a valid, trusted certificate — rejectUnauthorized:false
    // disabled that check entirely, which would let a MITM on the SMTP connection
    // intercept EMAIL_USER/EMAIL_PASS and every password-reset email's contents.
    // The service:'gmail' preset already supplies the correct host/port/secure values.
});