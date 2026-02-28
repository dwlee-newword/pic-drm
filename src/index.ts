import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';

import { HealthResponseSchema } from './types/health';
import type { Bindings, Variables } from './types/bindings';
import { authRouter } from './routes/auth';
import { adminAuthRouter } from './routes/adminAuth';
import { jobsRouter } from './routes/jobs';

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        { message: result.error.issues.map((i) => i.message).join(', ') },
        400,
      );
    }
  },
});

// CORS — reads allowed origin from the ALLOWED_ORIGIN environment binding.
app.use('*', async (c, next) => {
  return cors({
    origin: c.env.ALLOWED_ORIGIN,
    allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })(c, next);
});

// Security headers — applied to every response.
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (c.env.ENVIRONMENT !== 'development') {
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});

/** GET /health — liveness check */
const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  summary: 'Health check',
  description: 'Returns 200 OK when the worker is alive.',
  tags: ['System'],
  responses: {
    200: {
      description: 'Worker is healthy',
      content: {
        'application/json': {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

app.openapi(healthRoute, (c) => {
  return c.json({ status: 'ok' } as const, 200);
});

/** Blocks the route in non-development environments. */
const devOnly: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (
  c,
  next,
) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.notFound();
  }
  return next();
};

/** GET /openapi.json — OpenAPI 3.1 spec (dev only) */
app.use('/openapi.json', devOnly);

// Register Bearer JWT as a reusable security scheme for the Swagger UI "Authorize" button.
app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'JWT issued by POST /auth/signup or POST /auth/login.',
});

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'pic-drm API',
    version: '0.1.0',
    description: 'Steganography orchestration API powered by Cloudflare Workers.',
  },
});

/** GET /docs — Swagger UI (dev only) */
app.use('/docs', devOnly);
app.get('/docs', swaggerUI({ url: '/openapi.json' }));

app.route('/', authRouter);
app.route('/', adminAuthRouter);
app.route('/', jobsRouter);

export default app;
