import { z } from 'zod';

const NonblankStringSchema = z.string().refine((value) => value.trim().length > 0);

/** Preferred new-plan metadata. Unknown project fields remain allowed. */
export const PlanMetadataSchema = z.looseObject({
  id: NonblankStringSchema,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: NonblankStringSchema,
});

export type IPlanMetadata = z.infer<typeof PlanMetadataSchema>;

/** Character offsets count UTF-16 code units; lines and columns start at one. */
export const SourceLocationSchema = z.object({
  offset: z.number().int().nonnegative(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

export type ISourceLocation = z.infer<typeof SourceLocationSchema>;

/** Document observations, never permissions or execution decisions. */
export const DiagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  document: z.enum(['plan', 'milestones']),
  message: z.string(),
  location: SourceLocationSchema.optional(),
});

export type IDiagnostic = z.infer<typeof DiagnosticSchema>;

/** The checker accepts named document sources; omitted files stay absent. */
export const PlanDocumentsSchema = z.strictObject({
  plan: z.string().optional(),
  milestones: z.string().optional(),
});

export type IPlanDocuments = z.infer<typeof PlanDocumentsSchema>;

export const ReadOptionsSchema = z.strictObject({
  maxBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
});

export type IReadOptions = z.infer<typeof ReadOptionsSchema>;
