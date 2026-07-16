/**
 * Escapes a dynamic value for safe interpolation into an HTML email template
 * literal - every interpolated value (name, email, OTP, device info, etc.)
 * must go through this before landing in a template string.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}
