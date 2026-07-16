import { escapeHtml } from '../mail-html.util';
import { renderEmailLayout } from './email-layout';

export function passwordChangedEmail(params: { name: string | null }): {
  subject: string;
  html: string;
} {
  const greetingName = params.name ? escapeHtml(params.name) : 'there';

  const body = `
    <p style="margin:0 0 16px;">Hi ${greetingName},</p>
    <p style="margin:0 0 16px;">Your DailyFit Coach password was just changed. For your security, you've been logged out of all devices and will need to log in again.</p>
    <p style="margin:0 0 8px;"><strong>Wasn't you?</strong> Contact us immediately at <a href="mailto:dailyfitscoaching@gmail.com" style="color:#1f6f4a;">dailyfitscoaching@gmail.com</a> so we can help secure your account.</p>
  `;

  return {
    subject: 'Your DailyFit Coach password was changed',
    html: renderEmailLayout(body),
  };
}
