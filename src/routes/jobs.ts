import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';

import { authenticate } from '../middleware/auth';
import type { Bindings, Variables } from '../types/bindings';
import {
  CreateDraftRequestSchema,
  CreateDraftResponseSchema,
  JobErrorSchema,
  JobStatusResponseSchema,
  SubmitJobResponseSchema,
  UploadFileResponseSchema,
} from '../types/job';
import type {
  CreateDraftResponse,
  JobStatusResponse,
  SubmitJobResponse,
  UploadFileResponse,
} from '../types/job';

export const jobsRouter = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

/** Internal D1 row type returned by job queries. */
type JobRow = {
  total_files: number;
  uploaded_files: number;
  status: string;
};

/** Internal D1 row type returned by job_files queries. */
type FileRow = {
  storage_key: string;
  upload_status: string;
};

/** Internal D1 row type for pending file index queries. */
type PendingIndexRow = {
  file_index: number;
};

// Apply user JWT authentication to all /jobs/* routes.
jobsRouter.use('/jobs/*', authenticate);

// ---------------------------------------------------------------------------
// Shared parameter schemas
// ---------------------------------------------------------------------------

/** Path parameters for routes that reference a job by ID. */
const JobIdParamSchema = z.object({
  jobId: z.string().uuid().openapi({ description: 'Unique job identifier (UUID).' }),
});

/** Path parameters for the file upload route. */
const FileUploadParamSchema = z.object({
  jobId: z.string().uuid().openapi({ description: 'Unique job identifier (UUID).' }),
  fileIndex: z.coerce
    .number()
    .int()
    .min(0)
    .openapi({ description: 'Zero-based index of the file within the job.' }),
});

/** Request body schema for the file upload route (multipart/form-data). */
const UploadFileBodySchema = z.object({
  file: z
    .any()
    .openapi({ type: 'string', format: 'binary', description: 'Binary content of the file to upload.' }),
});

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

/** POST /jobs/draft route definition for OpenAPI. */
const createDraftRoute = createRoute({
  method: 'post',
  path: '/jobs/draft',
  summary: 'Create a draft job',
  description:
    'Creates a draft job with pre-registered file metadata. Returns a `jobId` used to upload each file via `PUT /jobs/{jobId}/files/{fileIndex}` before submitting.',
  tags: ['Jobs'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: CreateDraftRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Draft job created successfully.',
      content: { 'application/json': { schema: CreateDraftResponseSchema } },
    },
    400: {
      description: 'Invalid request body.',
      content: { 'application/json': { schema: JobErrorSchema } },
    },
  },
});

/** PUT /jobs/{jobId}/files/{fileIndex} route definition for OpenAPI. */
const uploadFileRoute = createRoute({
  method: 'put',
  path: '/jobs/{jobId}/files/{fileIndex}',
  summary: 'Upload a file',
  description:
    'Uploads a single file to R2 for a draft job. This operation is idempotent: re-uploading the same `fileIndex` does not double-increment the upload counter.',
  tags: ['Jobs'],
  security: [{ bearerAuth: [] }],
  request: {
    params: FileUploadParamSchema,
    body: {
      content: { 'multipart/form-data': { schema: UploadFileBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'File uploaded successfully.',
      content: { 'application/json': { schema: UploadFileResponseSchema } },
    },
    400: {
      description: 'Invalid file index or missing `file` field in form data.',
      content: { 'application/json': { schema: JobErrorSchema } },
    },
    404: {
      description: 'Job or file record not found, or the job is not in draft state.',
      content: { 'application/json': { schema: JobErrorSchema } },
    },
  },
});

/** POST /jobs/{jobId}/submit route definition for OpenAPI. */
const submitJobRoute = createRoute({
  method: 'post',
  path: '/jobs/{jobId}/submit',
  summary: 'Submit a draft job',
  description:
    'Finalizes a draft job after all files have been uploaded. Transitions the job status from `draft` to `pending`. Returns `400` if any file upload is still pending.',
  tags: ['Jobs'],
  security: [{ bearerAuth: [] }],
  request: {
    params: JobIdParamSchema,
  },
  responses: {
    200: {
      description: 'Job submitted successfully.',
      content: { 'application/json': { schema: SubmitJobResponseSchema } },
    },
    400: {
      description: 'Job is not in draft state, or not all files have been uploaded.',
      content: { 'application/json': { schema: JobErrorSchema } },
    },
    404: {
      description: 'Job not found.',
      content: { 'application/json': { schema: JobErrorSchema } },
    },
  },
});

/** GET /jobs/{jobId}/status route definition for OpenAPI. */
const getJobStatusRoute = createRoute({
  method: 'get',
  path: '/jobs/{jobId}/status',
  summary: 'Get job upload status',
  description:
    'Returns the current upload progress for a draft job, including the list of pending file indices. Used by the frontend to resume an interrupted upload session.',
  tags: ['Jobs'],
  security: [{ bearerAuth: [] }],
  request: {
    params: JobIdParamSchema,
  },
  responses: {
    200: {
      description: 'Job status retrieved successfully.',
      content: { 'application/json': { schema: JobStatusResponseSchema } },
    },
    404: {
      description: 'Job not found.',
      content: { 'application/json': { schema: JobErrorSchema } },
    },
  },
});

/** POST /jobs/{jobId}/complete route definition for OpenAPI. */
const completeJobRoute = createRoute({
  method: 'post',
  path: '/jobs/{jobId}/complete',
  summary: 'Complete a pending job (temporary)',
  description:
    '**Temporary endpoint.** Simulates the delivery worker marking a job as completed. In production, this transition should be triggered internally by the processing worker. Remove or restrict once the actual worker pipeline is implemented.',
  tags: ['Jobs'],
  security: [{ bearerAuth: [] }],
  request: {
    params: JobIdParamSchema,
  },
  responses: {
    200: {
      description: 'Job marked as completed.',
      content: { 'application/json': { schema: SubmitJobResponseSchema } },
    },
    400: {
      description: 'Job is not in pending state.',
      content: { 'application/json': { schema: JobErrorSchema } },
    },
    404: {
      description: 'Job not found.',
      content: { 'application/json': { schema: JobErrorSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * POST /jobs/draft — creates a draft job with pre-registered file metadata.
 *
 * Accepts application/json with:
 *   - `security`    — SecurityOptions object
 *   - `recipients`  — Recipient[] (at least one)
 *   - `fileMeta`    — DraftFileMetaItem[] (at least one) with name and size per file
 *
 * Pre-generates a storage key per file and inserts job_files rows with upload_status='pending'.
 * The job status is set to 'draft' until POST /jobs/:jobId/submit is called.
 */
jobsRouter.openapi(createDraftRoute, async (c) => {
  const { sub: userEmail } = c.var.jwtPayload;
  const { security, recipients, fileMeta } = c.req.valid('json');

  const jobId = crypto.randomUUID();
  const totalFiles = fileMeta.length;

  // Pre-generate storage keys for each file
  const storageKeys = fileMeta.map(
    (meta) => `jobs/${jobId}/${crypto.randomUUID()}-${meta.fileName}`,
  );

  // Insert the draft job
  await c.env.DB.prepare(
    `INSERT INTO jobs
       (id, user_email, security_text, anti_screenshot, anti_copy, view_limit, domain_restrict, expiration, status, total_files, uploaded_files)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 0)`,
  )
    .bind(
      jobId,
      userEmail,
      security.securityText,
      security.antiScreenshot ? 1 : 0,
      security.antiCopy ? 1 : 0,
      security.viewLimit ? 1 : 0,
      security.domainRestrict ? 1 : 0,
      security.expiration ? 1 : 0,
      totalFiles,
    )
    .run();

  // Batch-insert file placeholders and recipients
  const fileInserts = fileMeta.map((meta, i) =>
    c.env.DB.prepare(
      `INSERT INTO job_files (job_id, original_name, folder_name, storage_key, size_bytes, upload_status, file_index)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    ).bind(jobId, meta.fileName, meta.folderName, storageKeys[i], meta.sizeBytes, i),
  );

  const recipientInserts = recipients.map((r) =>
    c.env.DB.prepare(
      'INSERT INTO job_recipients (job_id, email, source) VALUES (?, ?, ?)',
    ).bind(jobId, r.email, r.source),
  );

  await c.env.DB.batch([...fileInserts, ...recipientInserts]);

  return c.json({ jobId } satisfies CreateDraftResponse, 201);
});

/**
 * PUT /jobs/{jobId}/files/{fileIndex} — uploads a single file to R2 for a draft job.
 *
 * Accepts multipart/form-data with a single `file` field.
 * This operation is idempotent: re-uploading the same fileIndex does not double-increment
 * the uploaded_files counter because the DB update is guarded by `upload_status='pending'`.
 *
 * Ownership is enforced via a JOIN on user_email — returns 404 if the job belongs to another user.
 */
jobsRouter.openapi(uploadFileRoute, async (c) => {
  const { sub: userEmail } = c.var.jwtPayload;
  const { jobId, fileIndex } = c.req.valid('param');

  // Verify ownership and retrieve the pre-assigned storage key
  const fileRow = await c.env.DB.prepare(
    `SELECT jf.storage_key, jf.upload_status
     FROM job_files jf
     INNER JOIN jobs j ON j.id = jf.job_id
     WHERE jf.job_id = ? AND jf.file_index = ? AND j.user_email = ? AND j.status = 'draft'`,
  )
    .bind(jobId, fileIndex, userEmail)
    .first<FileRow>();

  if (!fileRow) {
    throw new HTTPException(404, { message: 'File not found or job is not in draft state.' });
  }

  const formData = await c.req.formData();
  const file = formData.get('file');

  if (file === null || typeof file === 'string') {
    throw new HTTPException(400, { message: 'Missing "file" field.' });
  }

  // Upload to R2 using the pre-assigned key (overwrites on retry — idempotent)
  await c.env.BUCKET.put(fileRow.storage_key, file);

  // Increment counter only on the first successful upload of this file index
  const updateResult = await c.env.DB.prepare(
    `UPDATE job_files SET upload_status = 'uploaded'
     WHERE job_id = ? AND file_index = ? AND upload_status = 'pending'`,
  )
    .bind(jobId, fileIndex)
    .run();

  if (updateResult.meta.changes > 0) {
    await c.env.DB.prepare(
      `UPDATE jobs SET uploaded_files = uploaded_files + 1 WHERE id = ?`,
    )
      .bind(jobId)
      .run();
  }

  const jobRow = await c.env.DB.prepare(
    `SELECT total_files, uploaded_files FROM jobs WHERE id = ?`,
  )
    .bind(jobId)
    .first<Pick<JobRow, 'total_files' | 'uploaded_files'>>();

  if (!jobRow) {
    throw new HTTPException(500, { message: 'Failed to retrieve job state.' });
  }

  return c.json(
    {
      fileIndex,
      uploadedFiles: jobRow.uploaded_files,
      totalFiles: jobRow.total_files,
    } satisfies UploadFileResponse,
    200,
  );
});

/**
 * POST /jobs/{jobId}/submit — finalizes a draft job after all files are uploaded.
 *
 * Transitions job status from 'draft' to 'pending'.
 * Returns 400 if the job is not in draft state or not all files have been uploaded.
 */
jobsRouter.openapi(submitJobRoute, async (c) => {
  const { sub: userEmail } = c.var.jwtPayload;
  const { jobId } = c.req.valid('param');

  const jobRow = await c.env.DB.prepare(
    `SELECT total_files, uploaded_files, status FROM jobs WHERE id = ? AND user_email = ?`,
  )
    .bind(jobId, userEmail)
    .first<JobRow>();

  if (!jobRow) {
    throw new HTTPException(404, { message: 'Job not found.' });
  }

  if (jobRow.status !== 'draft') {
    throw new HTTPException(400, { message: 'Already submitted.' });
  }

  if (jobRow.uploaded_files < jobRow.total_files) {
    throw new HTTPException(400, {
      message: 'Not all files have been uploaded yet.',
    });
  }

  await c.env.DB.prepare(`UPDATE jobs SET status = 'pending' WHERE id = ?`).bind(jobId).run();

  return c.json({ jobId } satisfies SubmitJobResponse, 200);
});

/**
 * GET /jobs/{jobId}/status — returns the current upload progress for a draft job.
 *
 * Used by the frontend to resume an interrupted upload session.
 * Returns the list of file indices that still need to be uploaded (pendingIndices).
 */
jobsRouter.openapi(getJobStatusRoute, async (c) => {
  const { sub: userEmail } = c.var.jwtPayload;
  const { jobId } = c.req.valid('param');

  const jobRow = await c.env.DB.prepare(
    `SELECT total_files, uploaded_files, status FROM jobs WHERE id = ? AND user_email = ?`,
  )
    .bind(jobId, userEmail)
    .first<JobRow>();

  if (!jobRow) {
    throw new HTTPException(404, { message: 'Job not found.' });
  }

  const pendingResult = await c.env.DB.prepare(
    `SELECT file_index FROM job_files WHERE job_id = ? AND upload_status = 'pending'`,
  )
    .bind(jobId)
    .all<PendingIndexRow>();

  const pendingIndices = pendingResult.results.map((r) => r.file_index);

  return c.json(
    {
      jobId,
      status: jobRow.status,
      totalFiles: jobRow.total_files,
      uploadedFiles: jobRow.uploaded_files,
      pendingIndices,
    } satisfies JobStatusResponse,
    200,
  );
});

/**
 * POST /jobs/{jobId}/complete — marks a pending job as completed.
 *
 * TEMPORARY: This endpoint simulates the delivery worker confirming that all
 * watermarked files have been sent to recipients. In production this transition
 * should be triggered internally by the processing worker, not exposed as a
 * user-callable API. Remove or restrict this endpoint once the actual worker
 * pipeline is implemented.
 *
 * Transitions job status from 'pending' to 'completed'.
 * Returns 400 if the job is not in pending state.
 */
jobsRouter.openapi(completeJobRoute, async (c) => {
  const { sub: userEmail } = c.var.jwtPayload;
  const { jobId } = c.req.valid('param');

  const jobRow = await c.env.DB.prepare(
    `SELECT status FROM jobs WHERE id = ? AND user_email = ?`,
  )
    .bind(jobId, userEmail)
    .first<Pick<JobRow, 'status'>>();

  if (!jobRow) {
    throw new HTTPException(404, { message: 'Job not found.' });
  }

  if (jobRow.status !== 'pending') {
    throw new HTTPException(400, { message: 'Job is not in pending state.' });
  }

  await c.env.DB.prepare(`UPDATE jobs SET status = 'completed' WHERE id = ?`).bind(jobId).run();

  return c.json({ jobId } satisfies SubmitJobResponse, 200);
});

// Re-export schemas so index.ts can register them with the OpenAPI registry if needed.
export {
  CreateDraftResponseSchema,
  JobStatusResponseSchema,
  UploadFileResponseSchema,
  SubmitJobResponseSchema,
};
