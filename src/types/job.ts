import { z } from '@hono/zod-openapi';

/** Security options applied to all files in a job. */
export const SecurityOptionsSchema = z
  .object({
    securityText: z.string().openapi({ example: 'CITRUS LETTER SECURED', description: 'Visible watermark text embedded into images.' }),
    antiScreenshot: z.boolean().openapi({ description: 'Prevent screenshots of the protected content.' }),
    antiCopy: z.boolean().openapi({ description: 'Prevent copying of the protected content.' }),
    viewLimit: z.boolean().openapi({ description: 'Limit the number of times content can be viewed.' }),
    domainRestrict: z.boolean().openapi({ description: 'Restrict content access to specific domains.' }),
    expiration: z.boolean().openapi({ description: 'Apply an expiration date to content access.' }),
  })
  .openapi('SecurityOptions');

export type SecurityOptions = z.infer<typeof SecurityOptionsSchema>;

/** A single recipient who will receive the protected files. */
export const RecipientSchema = z
  .object({
    email: z.string().email().openapi({ example: 'user@example.com' }),
    source: z.enum(['direct', 'csv']).openapi({ description: "How the recipient was added: 'direct' input or 'csv' upload." }),
  })
  .openapi('Recipient');

export type Recipient = z.infer<typeof RecipientSchema>;

/** File metadata sent alongside each file upload. */
export const FileMetaItemSchema = z.object({
  folderName: z.string().openapi({ description: 'Top-level folder the file belongs to.' }),
});

export type FileMetaItem = z.infer<typeof FileMetaItemSchema>;

/** Extended file metadata used when creating a draft job (includes name and size for pre-registration). */
export const DraftFileMetaItemSchema = z.object({
  folderName: z.string().openapi({ description: 'Top-level folder the file belongs to.' }),
  fileName: z.string().openapi({ description: 'Original file name.' }),
  sizeBytes: z.number().int().positive().openapi({ description: 'File size in bytes.' }),
});

export type DraftFileMetaItem = z.infer<typeof DraftFileMetaItemSchema>;

/** Request body for POST /jobs/draft — creates a draft job without uploading files. */
export const CreateDraftRequestSchema = z
  .object({
    security: SecurityOptionsSchema,
    recipients: z.array(RecipientSchema).min(1, 'At least one recipient is required.'),
    fileMeta: z.array(DraftFileMetaItemSchema).min(1, 'At least one file is required.'),
  })
  .openapi('CreateDraftRequest');

export type CreateDraftRequest = z.infer<typeof CreateDraftRequestSchema>;

/** Response body for POST /jobs/draft. */
export const CreateDraftResponseSchema = z
  .object({
    jobId: z.string().openapi({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Unique identifier for the created draft job.' }),
  })
  .openapi('CreateDraftResponse');

export type CreateDraftResponse = z.infer<typeof CreateDraftResponseSchema>;

/** Response body for GET /jobs/:jobId/status — used to resume an interrupted upload. */
export const JobStatusResponseSchema = z
  .object({
    jobId: z.string().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    status: z.string().openapi({ example: 'draft', description: "Current job status: 'draft', 'pending', etc." }),
    totalFiles: z.number().int().openapi({ description: 'Total number of files registered for this job.' }),
    uploadedFiles: z.number().int().openapi({ description: 'Number of files successfully uploaded so far.' }),
    pendingIndices: z.array(z.number().int()).openapi({ description: 'File indices that have not yet been uploaded.' }),
  })
  .openapi('JobStatusResponse');

export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;

/** Response body for PUT /jobs/:jobId/files/:fileIndex. */
export const UploadFileResponseSchema = z
  .object({
    fileIndex: z.number().int().openapi({ description: 'The index of the file just uploaded.' }),
    uploadedFiles: z.number().int().openapi({ description: 'Total files uploaded so far after this upload.' }),
    totalFiles: z.number().int().openapi({ description: 'Total files registered for the job.' }),
  })
  .openapi('UploadFileResponse');

export type UploadFileResponse = z.infer<typeof UploadFileResponseSchema>;

/** Response body for POST /jobs/:jobId/submit. */
export const SubmitJobResponseSchema = z
  .object({
    jobId: z.string().openapi({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Unique identifier for the submitted job.' }),
  })
  .openapi('SubmitJobResponse');

export type SubmitJobResponse = z.infer<typeof SubmitJobResponseSchema>;

/** Response body for a successful job creation (legacy — kept for reference). */
export const CreateJobResponseSchema = z
  .object({
    jobId: z.string().openapi({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Unique identifier for the created job.' }),
  })
  .openapi('CreateJobResponse');

export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>;

/** Generic error response. */
export const JobErrorSchema = z
  .object({
    message: z.string().openapi({ example: 'Missing "security" field.' }),
  })
  .openapi('JobError');
