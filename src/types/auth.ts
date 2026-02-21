import { z } from '@hono/zod-openapi';

/** Schema for the authenticated user object embedded in auth responses. */
export const UserSchema = z
  .object({
    email: z.string().email().openapi({ example: 'user@example.com' }),
    name: z.string().openapi({ example: 'Jane Doe' }),
  })
  .openapi('User');

/** Schema for the POST /auth/signup request body. */
export const SignupRequestSchema = z
  .object({
    email: z.string().email().openapi({ example: 'user@example.com' }),
    name: z
      .string()
      .min(1)
      .max(100)
      .openapi({ example: 'Jane Doe', description: 'Display name (1–100 characters).' }),
    password: z
      .string()
      .min(8)
      .max(100)
      .openapi({ example: 'secret1234', description: 'Password (8–100 characters).' }),
  })
  .openapi('SignupRequest');

/** Schema for the POST /auth/signup success response body. */
export const SignupResponseSchema = z
  .object({
    token: z.string().openapi({
      example: 'eyJhbGciOiJIUzI1NiJ9...',
      description: 'Signed JWT valid for 7 days.',
    }),
    user: UserSchema,
  })
  .openapi('SignupResponse');

/** Schema for the POST /auth/login request body. */
export const LoginRequestSchema = z
  .object({
    email: z.string().email().openapi({ example: 'user@example.com' }),
    password: z
      .string()
      .min(8)
      .max(100)
      .openapi({ example: 'secret1234', description: 'Password (8–100 characters).' }),
  })
  .openapi('LoginRequest');

/** Schema for the POST /auth/login success response body. */
export const LoginResponseSchema = z
  .object({
    token: z.string().openapi({
      example: 'eyJhbGciOiJIUzI1NiJ9...',
      description: 'Signed JWT valid for 7 days.',
    }),
    user: UserSchema,
  })
  .openapi('LoginResponse');

/** Schema for a generic auth error response. */
export const AuthErrorSchema = z
  .object({
    message: z.string().openapi({ example: 'Invalid email or password.' }),
  })
  .openapi('AuthError');

/** Shape of the decoded JWT payload stored in context by the `authenticate` middleware. */
export type JwtPayload = {
  /** Subject — the authenticated user's email address. */
  sub: string;
  /** User's display name. */
  name: string;
  /** Issued-at timestamp (Unix seconds). */
  iat: number;
  /** Expiration timestamp (Unix seconds). */
  exp: number;
};

export type SignupRequest = z.infer<typeof SignupRequestSchema>;
export type SignupResponse = z.infer<typeof SignupResponseSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type User = z.infer<typeof UserSchema>;
