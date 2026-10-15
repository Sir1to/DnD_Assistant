import { z } from 'zod';

const booleanFromEnvironment = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalIsoDate = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.iso.datetime().optional(),
);

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.url().startsWith('postgresql://'),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  COOKIE_SECURE: booleanFromEnvironment,
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  LOGIN_RATE_LIMIT_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(86_400).default(900),
  FILE_STORAGE_PATH: z.string().trim().min(1).default('./data'),
  APP_VERSION: z.string().trim().min(1).max(64).default('0.1.0'),
  APP_COMMIT: z.string().trim().min(1).max(64).default('development'),
  APP_BUILD_TIME: optionalIsoDate,
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  return environmentSchema.parse(input);
}
