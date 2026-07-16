type EnvironmentName = 'development' | 'test' | 'production';

const allowedNodeEnvs = new Set<EnvironmentName>([
  'development',
  'test',
  'production',
]);

const requiredEnvKeys = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_ACCESS_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_IN',
] as const;

const optionalEnvKeys = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_EMBEDDING_MODEL',
  'AI_PROVIDER',
  'AI_ENABLED',
  'AI_TIMEOUT_MS',
  'RESEND_API_KEY',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'CORS_ORIGINS',
  'USDA_API_KEY',
  'GOOGLE_CLIENT_ID',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_ID',
  'FRONTEND_URL',
  'ADMIN_BOOTSTRAP_EMAIL',
  'EMAIL_ENABLED',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
] as const;

type RequiredEnvKey = (typeof requiredEnvKeys)[number];
type OptionalEnvKey = (typeof optionalEnvKeys)[number];
type EnvKey = RequiredEnvKey | OptionalEnvKey;

export type EnvironmentVariables = Record<RequiredEnvKey, string> &
  Partial<Record<OptionalEnvKey, string>>;

function getStringValue(
  config: Record<string, unknown>,
  key: EnvKey,
): string | undefined {
  const value = config[key];

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const missing = requiredEnvKeys.filter((key) => !getStringValue(config, key));

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  const nodeEnv = getStringValue(config, 'NODE_ENV') as EnvironmentName;

  if (!allowedNodeEnvs.has(nodeEnv)) {
    throw new Error(
      `NODE_ENV must be one of: ${Array.from(allowedNodeEnvs).join(', ')}`,
    );
  }

  const port = Number(getStringValue(config, 'PORT'));

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be a valid TCP port number');
  }

  const aiProvider = getStringValue(config, 'AI_PROVIDER') ?? 'gemini';

  if (!['gemini', 'local'].includes(aiProvider)) {
    throw new Error('AI_PROVIDER must be one of: gemini, local');
  }

  const aiEnabled = getStringValue(config, 'AI_ENABLED') ?? 'true';

  if (!['true', 'false'].includes(aiEnabled)) {
    throw new Error('AI_ENABLED must be either true or false');
  }

  const aiTimeoutMs = Number(
    getStringValue(config, 'AI_TIMEOUT_MS') ?? '30000',
  );

  if (!Number.isInteger(aiTimeoutMs) || aiTimeoutMs < 1000) {
    throw new Error(
      'AI_TIMEOUT_MS must be an integer greater than or equal to 1000',
    );
  }

  const emailEnabled = getStringValue(config, 'EMAIL_ENABLED') ?? 'true';

  if (!['true', 'false'].includes(emailEnabled)) {
    throw new Error('EMAIL_ENABLED must be either true or false');
  }

  const geminiApiKey = getStringValue(config, 'GEMINI_API_KEY');

  if (nodeEnv === 'production' && aiEnabled === 'true' && !geminiApiKey) {
    throw new Error(
      'GEMINI_API_KEY is required in production when AI_ENABLED=true',
    );
  }

  const gmailUser = getStringValue(config, 'GMAIL_USER');
  const gmailAppPassword = getStringValue(config, 'GMAIL_APP_PASSWORD');

  if (
    nodeEnv === 'production' &&
    emailEnabled === 'true' &&
    (!gmailUser || !gmailAppPassword)
  ) {
    throw new Error(
      'GMAIL_USER and GMAIL_APP_PASSWORD are required in production when EMAIL_ENABLED=true',
    );
  }

  const optionalValues = Object.fromEntries(
    optionalEnvKeys.map((key) => [key, getStringValue(config, key)]),
  ) as Partial<Record<OptionalEnvKey, string>>;

  return {
    NODE_ENV: nodeEnv,
    PORT: String(port),
    DATABASE_URL: getStringValue(config, 'DATABASE_URL') as string,
    DIRECT_URL: getStringValue(config, 'DIRECT_URL') as string,
    JWT_ACCESS_SECRET: getStringValue(config, 'JWT_ACCESS_SECRET') as string,
    JWT_REFRESH_SECRET: getStringValue(config, 'JWT_REFRESH_SECRET') as string,
    JWT_ACCESS_EXPIRES_IN: getStringValue(
      config,
      'JWT_ACCESS_EXPIRES_IN',
    ) as string,
    JWT_REFRESH_EXPIRES_IN: getStringValue(
      config,
      'JWT_REFRESH_EXPIRES_IN',
    ) as string,
    ...optionalValues,
    GEMINI_API_KEY: geminiApiKey,
    GEMINI_MODEL: getStringValue(config, 'GEMINI_MODEL') ?? 'gemini-2.5-flash',
    GEMINI_EMBEDDING_MODEL:
      getStringValue(config, 'GEMINI_EMBEDDING_MODEL') ??
      'gemini-embedding-001',
    AI_PROVIDER: aiProvider,
    AI_ENABLED: aiEnabled,
    AI_TIMEOUT_MS: String(aiTimeoutMs),
    EMAIL_ENABLED: emailEnabled,
  };
}
