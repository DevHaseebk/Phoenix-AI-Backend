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
  'GEMINI_API_KEY',
] as const;

const optionalEnvKeys = [
  'RESEND_API_KEY',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'CORS_ORIGINS',
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
    GEMINI_API_KEY: getStringValue(config, 'GEMINI_API_KEY') as string,
    ...optionalValues,
  };
}
