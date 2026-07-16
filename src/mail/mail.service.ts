import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

/**
 * Wraps a single Gmail-SMTP Nodemailer transport for every transactional
 * email in the app. No-ops (logs, resolves immediately) when disabled or
 * unconfigured - mirrors LocalAiProvider's role for AI_ENABLED=false, so a
 * dev/test environment without Gmail creds never crashes on a mail send.
 *
 * sendMail() is the blocking path (used only where correctness requires the
 * caller to know a send failed, e.g. the password-reset OTP).
 * sendMailFireAndForget() is for everything else - it must never delay or
 * fail the caller's own request (e.g. login, signup, password change).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string | null;
  private readonly logoBuffer: Buffer;

  constructor(private readonly config: ConfigService) {
    const enabled = this.config.get<string>('EMAIL_ENABLED') !== 'false';
    const gmailUser = this.config.get<string>('GMAIL_USER');
    const gmailAppPassword = this.config.get<string>('GMAIL_APP_PASSWORD');

    this.logoBuffer = readFileSync(join(__dirname, 'logo-email.png'));

    if (!enabled || !gmailUser || !gmailAppPassword) {
      this.transporter = null;
      this.fromAddress = null;
      this.logger.warn(
        'Email sending is disabled or unconfigured (EMAIL_ENABLED/GMAIL_USER/GMAIL_APP_PASSWORD) - mail sends will no-op.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: gmailUser, pass: gmailAppPassword },
    });
    this.fromAddress = `"DailyFit Coach" <${gmailUser}>`;
  }

  /** Blocking send - throws on failure. Use only where the caller must know. */
  async sendMail(message: MailMessage): Promise<void> {
    if (!this.transporter || !this.fromAddress) {
      this.logger.warn(
        `Email disabled/unconfigured - would have sent "${message.subject}" to ${message.to}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: message.to,
      subject: message.subject,
      html: message.html,
      attachments: [
        {
          filename: 'logo.png',
          content: this.logoBuffer,
          cid: 'brand-logo',
        },
      ],
    });
  }

  /** Non-blocking send - never throws, logs and swallows failures. */
  sendMailFireAndForget(message: MailMessage): void {
    this.sendMail(message).catch((error: unknown) => {
      this.logger.error(
        `Failed to send "${message.subject}" to ${message.to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
}
