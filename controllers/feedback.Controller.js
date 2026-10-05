const { transporter } = require('./config');
const { buildFeedbackEmailHtml, LOGO_ATTACHMENT } = require('../utils/emailTemplate');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Landing page's public contact form — unauthenticated by design (visitors
// who aren't signed up yet need a way to reach out too), which is exactly
// why this validates its own inputs rather than trusting verifytoken to
// have done it, and why it's rate-limited at the route (routes.js).
exports.sendFeedback = async (req, res) => {
  try {
    const { firstname, lastname, email, message } = req.body;

    if (!firstname || !lastname || !email || !message) {
      return res.status(400).json({ message: 'Tous les champs sont requis.' });
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ message: 'Adresse email invalide.' });
    }
    // Generous ceilings, not UX limits — just enough to stop a script from
    // mailing a multi-megabyte payload to a personal inbox on every request.
    if (firstname.length > 100 || lastname.length > 100 || email.length > 200) {
      return res.status(400).json({ message: 'Champ trop long.' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ message: 'Message trop long (5000 caractères maximum).' });
    }

    await transporter.sendMail({
      from: `"Binomy" <${process.env.EMAIL_USER}>`,
      to: process.env.FEEDBACK_EMAIL || process.env.EMAIL_USER,
      // Lets the operator hit "Reply" in their inbox and answer the visitor
      // directly, instead of having to copy their address out of the body.
      replyTo: email.trim(),
      subject: `Nouveau message de ${firstname} ${lastname} — Binomy`,
      text: `De: ${firstname} ${lastname} <${email}>\n\n${message}`,
      html: buildFeedbackEmailHtml({ firstname, lastname, email, message }),
      attachments: [LOGO_ATTACHMENT],
    });

    res.json({ message: 'Message envoyé avec succès.' });
  } catch (error) {
    console.error('Error sending feedback email:', error);
    res.status(500).json({
      message: "Une erreur est survenue lors de l'envoi du message.",
      error: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
};
