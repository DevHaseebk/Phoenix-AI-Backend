import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

const sendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail })),
}));

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('MailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no-ops sendMail without throwing when EMAIL_ENABLED is false', async () => {
    const service = new MailService(
      makeConfig({
        EMAIL_ENABLED: 'false',
        GMAIL_USER: 'test@gmail.com',
        GMAIL_APP_PASSWORD: 'app-password',
      }),
    );

    await expect(
      service.sendMail({
        to: 'user@example.com',
        subject: 'Hi',
        html: '<p>Hi</p>',
      }),
    ).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('no-ops sendMail without throwing when Gmail creds are missing', async () => {
    const service = new MailService(makeConfig({ EMAIL_ENABLED: 'true' }));

    await expect(
      service.sendMail({
        to: 'user@example.com',
        subject: 'Hi',
        html: '<p>Hi</p>',
      }),
    ).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends via the transport with a CID logo attachment when configured', async () => {
    sendMail.mockResolvedValue(undefined);

    const service = new MailService(
      makeConfig({
        EMAIL_ENABLED: 'true',
        GMAIL_USER: 'test@gmail.com',
        GMAIL_APP_PASSWORD: 'app-password',
      }),
    );

    await service.sendMail({
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"DailyFit Coach" <test@gmail.com>',
        to: 'user@example.com',
        subject: 'Hi',
        attachments: [expect.objectContaining({ cid: 'brand-logo' })],
      }),
    );
  });

  it('sendMailFireAndForget swallows a rejected send instead of throwing', async () => {
    sendMail.mockRejectedValue(new Error('SMTP down'));

    const service = new MailService(
      makeConfig({
        EMAIL_ENABLED: 'true',
        GMAIL_USER: 'test@gmail.com',
        GMAIL_APP_PASSWORD: 'app-password',
      }),
    );

    expect(() =>
      service.sendMailFireAndForget({
        to: 'user@example.com',
        subject: 'Hi',
        html: '<p>Hi</p>',
      }),
    ).not.toThrow();

    // Flush the microtask queue so the internal .catch() actually runs
    // before the test (and process) exits.
    await new Promise((resolve) => process.nextTick(resolve));
  });
});
