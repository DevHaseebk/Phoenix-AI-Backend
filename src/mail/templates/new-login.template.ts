import { escapeHtml } from '../mail-html.util';
import { renderEmailLayout } from './email-layout';

export function newLoginEmail(params: {
  name: string | null;
  deviceName: string | null;
  deviceType: string | null;
  approximateTime: string;
  ipAddress: string | null;
}): { subject: string; html: string } {
  const greetingName = params.name ? escapeHtml(params.name) : 'there';
  const device = escapeHtml(
    params.deviceName || params.deviceType || 'an unrecognized device',
  );
  const time = escapeHtml(params.approximateTime);
  const ip = params.ipAddress ? escapeHtml(params.ipAddress) : null;

  const body = `
    <p style="margin:0 0 16px;">Hi ${greetingName},</p>
    <p style="margin:0 0 16px;">We noticed a new login to your DailyFit Coach account:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:0 0 20px; font-size:14px; color:#132018;">
      <tr><td style="padding:4px 0; color:#5c6b62;">Device</td><td style="padding:4px 0; text-align:right;">${device}</td></tr>
      <tr><td style="padding:4px 0; color:#5c6b62;">Time</td><td style="padding:4px 0; text-align:right;">${time}</td></tr>
      ${ip ? `<tr><td style="padding:4px 0; color:#5c6b62;">IP address</td><td style="padding:4px 0; text-align:right;">${ip}</td></tr>` : ''}
    </table>
    <p style="margin:0 0 8px;"><strong>Wasn't you?</strong> Go to Settings &rarr; Active Sessions to log out that device, or reset your password right away.</p>
  `;

  return {
    subject: 'New login to your DailyFit Coach account',
    html: renderEmailLayout(body),
  };
}
