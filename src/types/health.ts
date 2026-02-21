import { z } from '@hono/zod-openapi';

/** Zod schema for the health check response body. */
export const HealthResponseSchema = z
  .object({
    status: z.literal('ok').openapi({ example: 'ok' }),
  })
  .openapi('HealthResponse');

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
