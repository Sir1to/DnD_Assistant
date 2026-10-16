import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .email()
  .transform((value) => value.toLowerCase());

export const passwordSchema = z.string().min(12).max(128);

export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .transform((value) => {
    const normalized = value.toLowerCase();
    return normalized.includes('@') ? normalized : `${normalized}@fog.local`;
  })
  .pipe(z.string().email());

export const loginPasswordSchema = z.string().min(1).max(128);

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80),
});

export const loginRequestSchema = z.object({
  email: loginIdentifierSchema,
  password: loginPasswordSchema,
});

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  createdAt: z.string().datetime(),
});

export const authResponseSchema = z.object({
  user: userSchema,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type User = z.infer<typeof userSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
