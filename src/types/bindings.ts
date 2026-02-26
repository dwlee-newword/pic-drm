import type { JwtPayload } from './auth';
import type { AdminJwtPayload } from './admin';

/** Cloudflare Worker environment bindings available via `c.env.*`. */
export type Bindings = {
  /** Deployment environment identifier (e.g., 'development', 'production'). */
  ENVIRONMENT: string;
  /**
   * HMAC-SHA256 secret used to sign and verify JWTs.
   * Set via: `wrangler secret put JWT_SECRET`
   */
  JWT_SECRET: string;
  /**
   * Allowed CORS origin for the frontend.
   * Local dev: set in `.dev.vars` (e.g., `http://localhost:5173`).
   * Production: set in `wrangler.jsonc vars` (e.g., `https://citrus-letter.pages.dev`).
   */
  ALLOWED_ORIGIN: string;
  /** Cloudflare D1 database binding. Declared in wrangler.jsonc as `"binding": "DB"`. */
  DB: D1Database;
  /** Cloudflare R2 bucket for storing protected files. Declared in wrangler.jsonc as `"binding": "BUCKET"`. */
  BUCKET: R2Bucket;
};

/**
 * Hono context variables populated at runtime by middleware.
 * Access via `c.var.jwtPayload` or `c.get('jwtPayload')` in route handlers.
 */
export type Variables = {
  /** Decoded JWT payload, set by the `authenticate` middleware after successful verification. */
  jwtPayload: JwtPayload;
  /** Decoded admin JWT payload, set by the `authenticateAdmin` middleware after successful verification. */
  adminPayload: AdminJwtPayload;
};
