import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { sign, verify } from 'hono/jwt';
import { HTTPException } from 'hono/http-exception';

import {
  AdminErrorSchema,
  AdminLoginRequestSchema,
  AdminLoginResponseSchema,
  AdminRefreshRequestSchema,
  AdminRefreshResponseSchema,
  AdminSignupRequestSchema,
  AdminSignupResponseSchema,
} from '../types/admin';
import type { Bindings } from '../types/bindings';
import type {
  AdminLoginResponse,
  AdminRefreshResponse,
  AdminRefreshTokenPayload,
  AdminSignupResponse,
} from '../types/admin';
import { verifyPassword } from './auth';

/** Row shape returned from the admin_users table. */
type AdminUserRow = {
  email: string;
  name: string;
  password_hash: string;
};

/**
 * Hashes a plain-text password using PBKDF2 (SubtleCrypto — Web standard).
 * @param password - Plain-text password to hash
 * @returns A string in the format `<saltHex>:<hashHex>` suitable for D1 storage
 */
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );

  const toHex = (arr: Uint8Array): string =>
    Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  return `${toHex(salt)}:${toHex(new Uint8Array(derivedBits))}`;
}

/**
 * Builds a signed admin access token for the given admin user.
 * Valid for 15 minutes. Carries `name` claim for downstream use.
 * @param email - Admin's email address (JWT subject)
 * @param name  - Admin's display name stored in the token payload
 * @param secret - HMAC-SHA256 signing secret from `c.env.JWT_SECRET`
 * @returns Signed JWT string valid for 15 minutes
 */
async function buildAdminAccessToken(email: string, name: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: email, name, type: 'admin', iat: now, exp: now + 60 * 15 }, secret);
}

/**
 * Builds a signed admin refresh token for the given admin user.
 * Valid for 7 days. Does NOT carry `name` — use only to obtain a new access token.
 * @param email - Admin's email address (JWT subject)
 * @param secret - HMAC-SHA256 signing secret from `c.env.JWT_SECRET`
 * @returns Signed JWT string valid for 7 days
 */
async function buildAdminRefreshToken(email: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: email, type: 'admin-refresh', iat: now, exp: now + 60 * 60 * 24 * 7 }, secret);
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

/** POST /admin/auth/signup route definition for OpenAPI. */
const adminSignupRoute = createRoute({
  method: 'post',
  path: '/admin/auth/signup',
  summary: 'Admin sign up',
  description:
    'Creates a new admin account with email and display name. Returns a short-lived admin access token (15 min) and a long-lived admin refresh token (7 days).',
  tags: ['Admin Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: AdminSignupRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Admin account created successfully',
      content: { 'application/json': { schema: AdminSignupResponseSchema } },
    },
    409: {
      description: 'Email is already registered',
      content: { 'application/json': { schema: AdminErrorSchema } },
    },
  },
});

/** POST /admin/auth/login route definition for OpenAPI. */
const adminLoginRoute = createRoute({
  method: 'post',
  path: '/admin/auth/login',
  summary: 'Admin log in',
  description:
    'Verifies admin email and password, then returns a short-lived admin access token (15 min) and a long-lived admin refresh token (7 days).',
  tags: ['Admin Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: AdminLoginRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Admin login successful',
      content: { 'application/json': { schema: AdminLoginResponseSchema } },
    },
    401: {
      description: 'Invalid credentials',
      content: { 'application/json': { schema: AdminErrorSchema } },
    },
  },
});

/** POST /admin/auth/refresh route definition for OpenAPI. */
const adminRefreshRoute = createRoute({
  method: 'post',
  path: '/admin/auth/refresh',
  summary: 'Refresh admin access token',
  description: 'Verifies the admin refresh token and issues a new admin access token (15 min).',
  tags: ['Admin Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: AdminRefreshRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'New admin access token issued',
      content: { 'application/json': { schema: AdminRefreshResponseSchema } },
    },
    401: {
      description: 'Invalid or expired admin refresh token',
      content: { 'application/json': { schema: AdminErrorSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const adminAuthRouter = new OpenAPIHono<{ Bindings: Bindings }>();

/**
 * POST /admin/auth/signup — registers a new admin and returns an access + refresh token pair.
 * Passwords are hashed with PBKDF2 (100k iterations, SHA-256) before storage.
 */
adminAuthRouter.openapi(adminSignupRoute, async (c) => {
  const { email, name, password } = c.req.valid('json');

  const passwordHash = await hashPassword(password);

  try {
    await c.env.DB.prepare(
      'INSERT INTO admin_users (email, name, password_hash) VALUES (?, ?, ?)',
    )
      .bind(email, name, passwordHash)
      .run();
  } catch (err) {
    if (err instanceof Error && err.message?.includes('UNIQUE constraint failed')) {
      throw new HTTPException(409, { message: 'Email is already in use.' });
    }
    throw new HTTPException(500, { message: 'Failed to create admin account.' });
  }

  const [access_token, refresh_token] = await Promise.all([
    buildAdminAccessToken(email, name, c.env.JWT_SECRET),
    buildAdminRefreshToken(email, c.env.JWT_SECRET),
  ]);

  return c.json({ access_token, refresh_token, user: { email, name } } satisfies AdminSignupResponse, 201);
});

/**
 * POST /admin/auth/login — verifies admin credentials against D1 and returns an access + refresh token pair.
 * Returns 401 for both unknown email and wrong password (prevents user enumeration).
 */
adminAuthRouter.openapi(adminLoginRoute, async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await c.env.DB.prepare(
    'SELECT email, name, password_hash FROM admin_users WHERE email = ?',
  )
    .bind(email)
    .first<AdminUserRow>();

  if (!user) {
    throw new HTTPException(401, { message: 'Invalid email or password.' });
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new HTTPException(401, { message: 'Invalid email or password.' });
  }

  const [access_token, refresh_token] = await Promise.all([
    buildAdminAccessToken(user.email, user.name, c.env.JWT_SECRET),
    buildAdminRefreshToken(user.email, c.env.JWT_SECRET),
  ]);

  return c.json(
    { access_token, refresh_token, user: { email: user.email, name: user.name } } satisfies AdminLoginResponse,
    200,
  );
});

/**
 * POST /admin/auth/refresh — verifies the admin refresh token and issues a new admin access token.
 * Looks up the admin in D1 to confirm the account still exists before issuing.
 */
adminAuthRouter.openapi(adminRefreshRoute, async (c) => {
  const { refresh_token } = c.req.valid('json');

  let payload: unknown;
  try {
    payload = await verify(refresh_token, c.env.JWT_SECRET, 'HS256');
  } catch {
    throw new HTTPException(401, { message: 'Invalid or expired refresh token.' });
  }

  const p = payload as AdminRefreshTokenPayload;
  if (p.type !== 'admin-refresh' || typeof p.sub !== 'string') {
    throw new HTTPException(401, { message: 'Invalid token type.' });
  }

  const user = await c.env.DB.prepare('SELECT email, name FROM admin_users WHERE email = ?')
    .bind(p.sub)
    .first<{ email: string; name: string }>();

  if (!user) {
    throw new HTTPException(401, { message: 'Admin not found.' });
  }

  const access_token = await buildAdminAccessToken(user.email, user.name, c.env.JWT_SECRET);

  return c.json({ access_token } satisfies AdminRefreshResponse, 200);
});
