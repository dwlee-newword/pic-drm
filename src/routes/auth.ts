import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { sign, verify } from 'hono/jwt';
import { HTTPException } from 'hono/http-exception';

import {
  AuthErrorSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshRequestSchema,
  RefreshResponseSchema,
  SignupRequestSchema,
  SignupResponseSchema,
} from '../types/auth';
import type { Bindings } from '../types/bindings';
import type {
  LoginResponse,
  RefreshResponse,
  RefreshTokenPayload,
  SignupResponse,
} from '../types/auth';

/** Row shape returned from the users table. */
type UserRow = {
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
 * Verifies a plain-text password against a PBKDF2 hash produced by `hashPassword`.
 * @param password - Plain-text password to verify
 * @param storedHash - Hash string in the format `<saltHex>:<hashHex>` from D1 storage
 * @returns `true` if the password matches the stored hash, `false` otherwise
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, expectedHex] = storedHash.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
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

  const derivedHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return derivedHex === expectedHex;
}

/**
 * Builds a signed access token for the given user.
 * Valid for 15 minutes. Carries `name` claim for downstream use.
 * @param email - User's email address (JWT subject)
 * @param name  - User's display name stored in the token payload
 * @param secret - HMAC-SHA256 signing secret from `c.env.JWT_SECRET`
 * @returns Signed JWT string valid for 15 minutes
 */
async function buildAccessToken(email: string, name: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: email, name, type: 'access', iat: now, exp: now + 60 * 15 }, secret);
}

/**
 * Builds a signed refresh token for the given user.
 * Valid for 7 days. Does NOT carry `name` — use only to obtain a new access token.
 * @param email - User's email address (JWT subject)
 * @param secret - HMAC-SHA256 signing secret from `c.env.JWT_SECRET`
 * @returns Signed JWT string valid for 7 days
 */
async function buildRefreshToken(email: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: email, type: 'refresh', iat: now, exp: now + 60 * 60 * 24 * 7 }, secret);
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

/** POST /auth/signup route definition for OpenAPI. */
const signupRoute = createRoute({
  method: 'post',
  path: '/auth/signup',
  summary: 'Sign up',
  description:
    'Creates a new user account with email and display name. Returns a short-lived access token (15 min) and a long-lived refresh token (7 days).',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: SignupRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Account created successfully',
      content: { 'application/json': { schema: SignupResponseSchema } },
    },
    409: {
      description: 'Email is already registered',
      content: { 'application/json': { schema: AuthErrorSchema } },
    },
  },
});

/** POST /auth/login route definition for OpenAPI. */
const loginRoute = createRoute({
  method: 'post',
  path: '/auth/login',
  summary: 'Log in',
  description:
    'Verifies email and password, then returns a short-lived access token (15 min) and a long-lived refresh token (7 days).',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: LoginRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Login successful',
      content: { 'application/json': { schema: LoginResponseSchema } },
    },
    401: {
      description: 'Invalid credentials',
      content: { 'application/json': { schema: AuthErrorSchema } },
    },
  },
});

/** POST /auth/refresh route definition for OpenAPI. */
const refreshRoute = createRoute({
  method: 'post',
  path: '/auth/refresh',
  summary: 'Refresh access token',
  description: 'Verifies the refresh token and issues a new access token (15 min).',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: RefreshRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'New access token issued',
      content: { 'application/json': { schema: RefreshResponseSchema } },
    },
    401: {
      description: 'Invalid or expired refresh token',
      content: { 'application/json': { schema: AuthErrorSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const authRouter = new OpenAPIHono<{ Bindings: Bindings }>();

/**
 * POST /auth/signup — registers a new user and returns an access + refresh token pair.
 * Passwords are hashed with PBKDF2 (100k iterations, SHA-256) before storage.
 */
authRouter.openapi(signupRoute, async (c) => {
  const { email, name, password } = c.req.valid('json');

  const passwordHash = await hashPassword(password);

  try {
    await c.env.DB.prepare(
      'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)',
    )
      .bind(email, name, passwordHash)
      .run();
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new HTTPException(409, { message: 'Email is already in use.' });
    }
    throw new HTTPException(500, { message: 'Failed to create account.' });
  }

  const [access_token, refresh_token] = await Promise.all([
    buildAccessToken(email, name, c.env.JWT_SECRET),
    buildRefreshToken(email, c.env.JWT_SECRET),
  ]);

  return c.json({ access_token, refresh_token, user: { email, name } } satisfies SignupResponse, 201);
});

/**
 * POST /auth/login — verifies credentials against D1 and returns an access + refresh token pair.
 * Returns 401 for both unknown email and wrong password (prevents user enumeration).
 */
authRouter.openapi(loginRoute, async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await c.env.DB.prepare(
    'SELECT email, name, password_hash FROM users WHERE email = ?',
  )
    .bind(email)
    .first<UserRow>();

  if (!user) {
    throw new HTTPException(401, { message: 'Invalid email or password.' });
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new HTTPException(401, { message: 'Invalid email or password.' });
  }

  const [access_token, refresh_token] = await Promise.all([
    buildAccessToken(user.email, user.name, c.env.JWT_SECRET),
    buildRefreshToken(user.email, c.env.JWT_SECRET),
  ]);

  return c.json(
    { access_token, refresh_token, user: { email: user.email, name: user.name } } satisfies LoginResponse,
    200,
  );
});

/**
 * POST /auth/refresh — verifies the refresh token and issues a new access token.
 * Looks up the user in D1 to confirm the account still exists before issuing.
 */
authRouter.openapi(refreshRoute, async (c) => {
  const { refresh_token } = c.req.valid('json');

  let payload: unknown;
  try {
    payload = await verify(refresh_token, c.env.JWT_SECRET, 'HS256');
  } catch {
    throw new HTTPException(401, { message: 'Invalid or expired refresh token.' });
  }

  const p = payload as RefreshTokenPayload;
  if (p.type !== 'refresh' || typeof p.sub !== 'string') {
    throw new HTTPException(401, { message: 'Invalid token type.' });
  }

  const user = await c.env.DB.prepare('SELECT email, name FROM users WHERE email = ?')
    .bind(p.sub)
    .first<{ email: string; name: string }>();

  if (!user) {
    throw new HTTPException(401, { message: 'User not found.' });
  }

  const access_token = await buildAccessToken(user.email, user.name, c.env.JWT_SECRET);

  return c.json({ access_token } satisfies RefreshResponse, 200);
});
