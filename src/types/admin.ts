import { z } from '@hono/zod-openapi';

/** Schema for the authenticated admin object embedded in admin auth responses. */
export const AdminUserSchema = z
  .object({
    email: z.string().email().openapi({ example: 'admin@example.com' }),
    name: z.string().openapi({ example: 'Admin User' }),
  })
  .openapi('AdminUser');

/** Schema for the POST /admin/auth/signup request body. */
export const AdminSignupRequestSchema = z
  .object({
    email: z.string().email().openapi({ example: 'admin@example.com' }),
    name: z
      .string()
      .min(1)
      .max(100)
      .openapi({ example: 'Admin User', description: 'Display name (1–100 characters).' }),
    password: z
      .string()
      .min(8)
      .max(100)
      .openapi({ example: 'secret1234', description: 'Password (8–100 characters).' }),
  })
  .openapi('AdminSignupRequest');

/** Schema for the POST /admin/auth/signup success response body. */
export const AdminSignupResponseSchema = z
  .object({
    access_token: z.string().openapi({
      example: 'eyJhbGciOiJIUzI1NiJ9...',
      description: 'Signed JWT admin access token valid for 15 minutes.',
    }),
    refresh_token: z.string().openapi({
      example: 'eyJhbGciOiJIUzI1NiJ9...',
      description: 'Signed JWT admin refresh token valid for 7 days.',
    }),
    user: AdminUserSchema,
  })
  .openapi('AdminSignupResponse');

/** Schema for the POST /admin/auth/login request body. */
export const AdminLoginRequestSchema = z
  .object({
    email: z.string().email().openapi({ example: 'admin@example.com' }),
    password: z
      .string()
      .min(8)
      .max(100)
      .openapi({ example: 'secret1234', description: 'Password (8–100 characters).' }),
  })
  .openapi('AdminLoginRequest');

/** Schema for the POST /admin/auth/login success response body. */
export const AdminLoginResponseSchema = z
  .object({
    access_token: z.string().openapi({
      example: 'eyJhbGciOiJIUzI1NiJ9...',
      description: 'Signed JWT admin access token valid for 15 minutes.',
    }),
    refresh_token: z.string().openapi({
      example: 'eyJhbGciOiJIUzI1NiJ9...',
      description: 'Signed JWT admin refresh token valid for 7 days.',
    }),
    user: AdminUserSchema,
  })
  .openapi('AdminLoginResponse');

/** Schema for the POST /admin/auth/refresh request body. */
export const AdminRefreshRequestSchema = z
  .object({
    refresh_token: z.string().openapi({
      description: 'Admin refresh token issued at login or signup.',
    }),
  })
  .openapi('AdminRefreshRequest');

/** Schema for the POST /admin/auth/refresh success response body. */
export const AdminRefreshResponseSchema = z
  .object({
    access_token: z.string().openapi({
      example: 'eyJhbGciOiJIUzI1NiJ9...',
      description: 'New admin access token valid for 15 minutes.',
    }),
  })
  .openapi('AdminRefreshResponse');

/** Schema for a generic admin auth error response. */
export const AdminErrorSchema = z
  .object({
    message: z.string().openapi({ example: 'Invalid email or password.' }),
  })
  .openapi('AdminError');

/** Shape of the decoded JWT payload for admin access tokens. */
export type AdminJwtPayload = {
  /** Subject — the authenticated admin's email address. */
  sub: string;
  /** Admin's display name. */
  name: string;
  /** Token type — must be 'admin' for admin-protected routes. */
  type: 'admin';
  /** Issued-at timestamp (Unix seconds). */
  iat: number;
  /** Expiration timestamp (Unix seconds). */
  exp: number;
};

/** Shape of the decoded JWT payload for admin refresh tokens. */
export type AdminRefreshTokenPayload = {
  sub: string;
  type: 'admin-refresh';
  iat: number;
  exp: number;
};

export type AdminSignupRequest = z.infer<typeof AdminSignupRequestSchema>;
export type AdminSignupResponse = z.infer<typeof AdminSignupResponseSchema>;
export type AdminLoginRequest = z.infer<typeof AdminLoginRequestSchema>;
export type AdminLoginResponse = z.infer<typeof AdminLoginResponseSchema>;
export type AdminRefreshRequest = z.infer<typeof AdminRefreshRequestSchema>;
export type AdminRefreshResponse = z.infer<typeof AdminRefreshResponseSchema>;
export type AdminUser = z.infer<typeof AdminUserSchema>;
