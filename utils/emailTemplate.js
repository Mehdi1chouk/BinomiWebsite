const path = require('path');

// CID embedding, not a base64 data: URI — Gmail (confirmed live, notably on
// mobile) strips inline data: URI images from HTML emails as a spam/security
// measure, so the logo rendered as a broken-image icon. cid: references a
// proper MIME attachment instead, which is the standard, actually-reliable
// way to put a logo in a transactional email — every major client supports
// it. Also not a hosted https:// URL: the app has no public domain yet.
// Whoever calls buildActionEmailHtml must pass LOGO_ATTACHMENT into
// nodemailer's `attachments` array, or this image won't resolve either.
const LOGO_CID = 'binomy-logo-icon';
const LOGO_ATTACHMENT = {
  filename: 'binomy-logo.png',
  path: path.join(__dirname, 'assets/email-logo-icon.png'),
  cid: LOGO_CID,
};

// Shared shell every branded email sits inside — the logo header, the white
// card, the outer gray gutter. Table-based layout since that's what renders
// consistently across email clients (notably Outlook desktop), not just
// modern webmail. `bodyHtml` is trusted content built by the functions
// below, never raw user input — see escapeHtml in buildFeedbackEmailHtml
// for the one template that actually embeds user-submitted text.
const emailShell = (bodyHtml) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin:0; padding:0; background-color:#f4f2f7; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f2f7; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden;">
            <tr>
              <td style="background-color:#3d2c5b; padding:24px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td style="padding-right:10px; vertical-align:middle;"><img src="cid:${LOGO_CID}" width="28" height="24.5" alt="" style="display:block;"></td>
                  <td style="vertical-align:middle;"><span style="font-size:20px; font-weight:bold; color:#ffffff;">binom</span><span style="font-size:20px; font-weight:bold; color:#ff6b4a;">y</span></td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

// Renders the link as a styled button instead of a raw URL pasted into the
// message body — avoids exposing the token as plain, copy-pasteable text
// the way a bare link does.
const buildActionEmailHtml = ({ heading, bodyLines, buttonLabel, buttonUrl, footerNote }) => emailShell(`
  <h1 style="margin:0 0 16px; font-size:20px; color:#3d2c5b;">${heading}</h1>
  ${bodyLines.map((line) => `<p style="margin:0 0 16px; font-size:15px; line-height:1.5; color:#333333;">${line}</p>`).join('')}
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td align="center" style="border-radius:999px; background-color:#ff6b4a;">
        <a href="${buttonUrl}" style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:999px;">${buttonLabel}</a>
      </td>
    </tr>
  </table>
  ${footerNote ? `<p style="margin:16px 0 0; font-size:13px; line-height:1.5; color:#8c8699;">${footerNote}</p>` : ''}
`);

// Only this template embeds user-submitted text (the landing page's contact
// form, read by the operator in their own inbox) — escaped the same way
// SweetAlert2's title/html needed escaping in the frontend, since this is
// HTML a mail client will render, not plain text.
const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildFeedbackEmailHtml = ({ firstname, lastname, email, message }) => emailShell(`
  <h1 style="margin:0 0 16px; font-size:20px; color:#3d2c5b;">Nouveau message depuis le site</h1>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:16px;">
    <tr><td style="padding:4px 0; font-size:13px; color:#8c8699; width:90px;">De</td><td style="padding:4px 0; font-size:14px; color:#333333;">${escapeHtml(firstname)} ${escapeHtml(lastname)}</td></tr>
    <tr><td style="padding:4px 0; font-size:13px; color:#8c8699;">Email</td><td style="padding:4px 0; font-size:14px; color:#333333;">${escapeHtml(email)}</td></tr>
  </table>
  <p style="margin:0 0 8px; font-size:13px; color:#8c8699;">Message</p>
  <p style="margin:0; font-size:15px; line-height:1.6; color:#333333; white-space:pre-line; background-color:#f4f2f7; padding:16px; border-radius:8px;">${escapeHtml(message)}</p>
`);

module.exports = { buildActionEmailHtml, buildFeedbackEmailHtml, LOGO_ATTACHMENT };
