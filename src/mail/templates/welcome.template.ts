import { escapeHtml } from '../mail-html.util';
import { renderEmailLayout } from './email-layout';

export function welcomeEmail(params: { name: string | null }): {
  subject: string;
  html: string;
} {
  const greetingName = params.name ? escapeHtml(params.name) : 'there';

  const body = `
    <p style="margin:0 0 16px;">Hi ${greetingName},</p>
    <p style="margin:0 0 16px;">Welcome to DailyFit Coach! We're glad you're here.</p>
    <p style="margin:0 0 16px;">Your AI coach is ready to help you track meals, water, exercise, and weight, and stay consistent with real, day-to-day guidance. Next up: complete your onboarding so we can tailor your calorie and protein targets to you.</p>
    <p style="margin:0 0 8px;">Log in any time to pick up where you left off. We're rooting for you.</p>
  `;

  return {
    subject: 'Welcome to DailyFit Coach',
    html: renderEmailLayout(body),
  };
}
