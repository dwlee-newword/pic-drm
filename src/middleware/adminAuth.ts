import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import { HTTPException } from 'hono/http-exception';

import type { AdminJwtPayload } from '../types/admin';
import type { Bindings, Variables } from '../types/bindings';

/**
 * Type guard to ensure the raw JWT payload conforms to AdminJwtPayload.
 * Guards against tokens that are structurally valid but missing required claims,
 * and rejects non-admin tokens (type !== 'admin') used in place of admin access tokens.
 */
function isAdminJwtPayload(value: unknown): value is AdminJwtPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).sub === 'string' &&
    typeof (value as Record<string, unknown>).name === 'string' &&
    (value as Record<string, unknown>).type === 'admin' &&
    typeof (value as Record<string, unknown>).iat === 'number' &&
    typeof (value as Record<string, unknown>).exp === 'number'
  );
}

/**
 * Middleware that verifies the Bearer JWT in the `Authorization` header for admin routes.
 *
 * On success, stores the decoded payload in `c.var.adminPayload` for downstream handlers.
 * Throws `401 Unauthorized` when:
 *  - The `Authorization` header is missing or not in `Bearer <token>` format
 *  - The token signature is invalid
 *  - The token is expired
 *  - The token payload is missing required claims or is not an admin token (`type !== 'admin'`)
 *
 * @example Apply to a single route:
 * ```ts
 * app.get('/admin/protected', authenticateAdmin, (c) => {
 *   const { sub, name } = c.var.adminPayload;
 *   return c.json({ email: sub, name });
 * });
 * ```
 *
 * @example Apply to an entire route group:
 * ```ts
 * app.use('/jobs/*', authenticateAdmin);
 * ```
 */
export const authenticateAdmin = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const authorization = c.req.header('Authorization');

    if (!authorization?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing or malformed Authorization header.' });
    }

    const token = authorization.slice(7);

    let raw: unknown;
    try {
      raw = await verify(token, c.env.JWT_SECRET, 'HS256');
    } catch (_err) {
      throw new HTTPException(401, { message: 'Invalid or expired token.' });
    }

    if (!isAdminJwtPayload(raw)) {
      throw new HTTPException(401, { message: 'Invalid token payload.' });
    }

    c.set('adminPayload', raw);
    await next();
  },
);
