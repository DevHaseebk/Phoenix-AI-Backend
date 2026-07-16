import { escapeHtml } from '../mail-html.util';
import { renderEmailLayout } from './email-layout';

export function verifyEmailEmail(params: {
  name: string | null;
  otp: string;
}): { subject: string; html: string } {
  const greetingName = params.name ? escapeHtml(params.name) : 'there';
  const otp = escapeHtml(params.otp);

  const body = `
    <p style="margin:0 0 16px;">Hi ${greetingName},</p>
    <p style="margin:0 0 20px;">Please verify your email address for your DailyFit Coach account with this code. It expires in 10 minutes.</p>
    <p style="margin:0 0 20px; text-align:center;">
      <span style="display:inline-block; padding:14px 28px; background-color:#f3f6f4; border-radius:8px; font-size:28px; font-weight:700; letter-spacing:6px; color:#1f6f4a;">${otp}</span>
    </p>
    <p style="margin:0 0 8px;">You can keep using DailyFit Coach either way - this just helps us keep your account secure.</p>
  `;

  return {
    subject: 'Verify your DailyFit Coach email',
    html: renderEmailLayout(body),
  };
}
