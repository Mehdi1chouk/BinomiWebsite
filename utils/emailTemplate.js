const fs = require('fs');
const path = require('path');

// Embedded as a data URI, not a hosted URL: the app has no public domain yet
// (see environment.ts/​.env's deployment placeholders), and most email
// clients block remote images by default anyway until the recipient clicks
// "show images" — inlining means the logo is just always there. Read once at
// module load, not per email send. SVG isn't used here: email client SVG
// support is unreliable (notably Outlook desktop), unlike the PNG everything
// else on this logo already renders fine.
const LOGO_ICON_BASE64 = fs.readFileSync(path.join(__dirname, 'assets/email-logo-icon.png')).toString('base64');

// Shared HTML shell for action-link emails (email verification, password
// reset, ...). Renders the link as a styled button instead of a raw URL
// pasted into the message body — avoids exposing the token as plain,
// copy-pasteable text the way a bare link does. Table-based layout since
// that's what renders consistently across email clients (notably Outlook
// desktop), not just modern webmail.
const buildActionEmailHtml = ({ heading, bodyLines, buttonLabel, buttonUrl, footerNote }) => `
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
                  <td style="padding-right:10px; vertical-align:middle;"><img src="data:image/png;base64,${LOGO_ICON_BASE64}" width="28" height="24.5" alt="" style="display:block;"></td>
                  <td style="vertical-align:middle;"><span style="font-size:20px; font-weight:bold; color:#ffffff;">binom</span><span style="font-size:20px; font-weight:bold; color:#ff6b4a;">y</span></td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
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
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

module.exports = { buildActionEmailHtml };
