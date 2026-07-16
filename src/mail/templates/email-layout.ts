/**
 * Shared table-based HTML shell for all transactional emails - inline CSS
 * only, no external stylesheet, for Outlook/Gmail compatibility. The logo
 * is referenced via `cid:brand-logo` (a MIME attachment MailService adds to
 * every send), not a hosted URL or inline SVG, so it renders regardless of
 * a client's "block remote images" setting and needs no deployed asset URL.
 *
 * `bodyHtml` must already be composed of escaped dynamic values - this
 * layout does no escaping itself.
 */
export function renderEmailLayout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DailyFit Coach</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f3f6f4; font-family: Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f6f4; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e3ece7;">
            <tr>
              <td style="background-color:#1f6f4a; padding:20px 24px;">
                <img src="cid:brand-logo" alt="DailyFit Coach" width="180" height="41" style="display:block; border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px; color:#132018; font-size:15px; line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px; background-color:#f3f6f4; color:#5c6b62; font-size:12px; line-height:1.6;">
                <p style="margin:0 0 4px;">DailyFit Coach - your daily health &amp; fitness coach.</p>
                <p style="margin:0;">Need help? Contact us at <a href="mailto:dailyfitscoaching@gmail.com" style="color:#1f6f4a;">dailyfitscoaching@gmail.com</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
