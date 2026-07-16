import { escapeHtml } from '../mail-html.util';
import { renderEmailLayout } from './email-layout';

export function otpEmail(params: { name: string | null; otp: string }): {
  subject: string;
  html: string;
} {
  const greetingName = params.name ? escapeHtml(params.name) : 'there';
  const otp = escapeHtml(params.otp);

  const body = `
    <p style="margin:0 0 16px;">Hi ${greetingName},</p>
    <p style="margin:0 0 20px;">Use this code to reset your DailyFit Coach password. It expires in 10 minutes.</p>
    <p style="margin:0 0 20px; text-align:center;">
      <span style="display:inline-block; padding:14px 28px; background-color:#f3f6f4; border-radius:8px; font-size:28px; font-weight:700; letter-spacing:6px; color:#1f6f4a;">${otp}</span>
    </p>
    <p style="margin:0 0 8px;">If you didn't request this, you can safely ignore this email - your password won't change unless this code is used.</p>
  `;

  return {
    subject: 'Your DailyFit Coach password reset code',
    html: renderEmailLayout(body),
  };
}
