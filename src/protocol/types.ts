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

/** Exclusions are caller policy; no metadata key is excluded implicitly. */
export const PlanFingerprintOptionsSchema = z.strictObject({
  excludeMetadataKeys: z.array(z.string()).optional(),
});

export type IPlanFingerprintOptions = z.infer<typeof PlanFingerprintOptionsSchema>;

/** Closed JSON result for library and CLI consumers; unavailable identity has diagnostics. */
export const PlanFingerprintSchema = z
  .strictObject({
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    excludeMetadataKeys: z.array(z.string()).refine((keys) => new Set(keys).size === keys.length),
    diagnostics: z.array(DiagnosticSchema),
  })
  .refine((value) => value.sha256 !== null || value.diagnostics.length > 0);

export type IPlanFingerprint = z.infer<typeof PlanFingerprintSchema>;

/** Request a structural fingerprint without another document read or parse. */
export const InspectPlanOptionsSchema = ReadOptionsSchema.extend({
  fingerprint: PlanFingerprintOptionsSchema.optional(),
});

export type IInspectPlanOptions = z.infer<typeof InspectPlanOptionsSchema>;

/** Creation accepts JSON metadata, including project extensions and nonconforming known values. */
export const CreatePlanOptionsSchema = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(64),
  root: z
    .string()
    .min(1)
    .refine((value) => !value.includes('\0'))
    .optional(),
  body: z.string(),
  metadata: z.record(z.string(), z.json()).optional(),
  milestones: z.string().optional(),
});

export type ICreatePlanOptions = z.infer<typeof CreatePlanOptionsSchema>;

/** Only explicitly supplied core fields are changed; no implicit revision or timestamp bump. */
export const PlanSetSchema = z
  .strictObject({
    id: PlanMetadataSchema.shape.id.exactOptional(),
    created_at: PlanMetadataSchema.shape.created_at.exactOptional(),
    updated_at: PlanMetadataSchema.shape.updated_at.exactOptional(),
    revision: PlanMetadataSchema.shape.revision.exactOptional(),
    status: PlanMetadataSchema.shape.status.exactOptional(),
  })
  .refine((value) => Object.keys(value).length > 0);

/** A selector identifies one milestone; IDs and ordinals cannot be combined. */
export const MilestoneSelectorSchema = z.xor([
  z.strictObject({ id: z.uuid() }),
  z.strictObject({ ordinal: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
]);

export const MilestoneSetSchema = z
  .strictObject({
    status: NonblankStringSchema.refine(
      (value) => value === value.trim() && !/[\r\n]/.test(value),
    ).exactOptional(),
    id: z.uuid().exactOptional(),
  })
  .refine((value) => Object.keys(value).length > 0);

/** A call edits one document with one closed patch, never arbitrary prose. */
export const PlanUpdateSchema = z.discriminatedUnion('document', [
  z.strictObject({
    document: z.literal('plan'),
    set: PlanSetSchema,
    expectedSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
  z.strictObject({
    document: z.literal('milestones'),
    expectedSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    changes: z
      .array(z.strictObject({ select: MilestoneSelectorSchema, set: MilestoneSetSchema }))
      .min(1),
  }),
]);

export type IPlanUpdate = z.infer<typeof PlanUpdateSchema>;

/** Guarded document replacement; null expectations permit only absent milestone creation. */
export const PlanDocumentWriteSchema = z.discriminatedUnion('document', [
  z.strictObject({
    document: z.literal('plan'),
    expectedSha256: z.string().regex(/^[a-f0-9]{64}$/),
    body: z.string(),
    set: PlanSetSchema.optional(),
  }),
  z.strictObject({
    document: z.literal('milestones'),
    expectedSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    source: z.string(),
    assignMissingIds: z.boolean().optional(),
  }),
]);

export type IPlanDocumentWrite = z.infer<typeof PlanDocumentWriteSchema>;

/** Removing a selected regular milestone document always requires its observed hash. */
export const RemoveMilestonesSchema = z.strictObject({
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export type IRemoveMilestones = z.infer<typeof RemoveMilestonesSchema>;
