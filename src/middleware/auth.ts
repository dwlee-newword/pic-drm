import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import { HTTPException } from 'hono/http-exception';

import type { JwtPayload } from '../types/auth';
import type { Bindings, Variables } from '../types/bindings';

/**
 * Type guard to ensure the raw JWT payload conforms to JwtPayload.
 * Guards against tokens that are structurally valid but missing required claims.
 */
function isJwtPayload(value: unknown): value is JwtPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).sub === 'string' &&
    typeof (value as Record<string, unknown>).name === 'string' &&
    typeof (value as Record<string, unknown>).iat === 'number' &&
    typeof (value as Record<string, unknown>).exp === 'number'
  );
}

/**
 * Middleware that verifies the Bearer JWT in the `Authorization` header.
 *
 * On success, stores the decoded payload in `c.var.jwtPayload` for downstream handlers.
 * Throws `401 Unauthorized` when:
 *  - The `Authorization` header is missing or not in `Bearer <token>` format
 *  - The token signature is invalid
 *  - The token is expired
 *  - The token payload is missing required claims (`sub`, `name`, `iat`, `exp`)
 *
 * @example Apply to a single route:
 * ```ts
 * app.get('/protected', authenticate, (c) => {
 *   const { sub, name } = c.var.jwtPayload;
 *   return c.json({ email: sub, name });
 * });
 * ```
 *
 * @example Apply to an entire route group:
 * ```ts
 * app.use('/api/*', authenticate);
 * ```
 */
export const authenticate = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
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

    if (!isJwtPayload(raw)) {
      throw new HTTPException(401, { message: 'Invalid token payload.' });
    }

    c.set('jwtPayload', raw);
    await next();
  },
);
