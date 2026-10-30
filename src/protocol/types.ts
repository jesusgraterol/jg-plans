import { z } from 'zod';

import { PRIORITY_VALUES, PROGRESS_VALUES, PROTOCOL_VERSIONS } from './constants.ts';

const NonblankStringSchema = z.string().refine((value) => value.trim().length > 0);

// a valid criterion ID: AC-01 to AC-99, then AC-100 and up without extra leading zeros
export const CriterionIdSchema = z.string().regex(/^AC-(?:0[1-9]|[1-9]\d+)$/);

// the shared progress vocabulary of protocol 0.2
export const ProgressSchema = z.enum(PROGRESS_VALUES);

export type IProgress = z.infer<typeof ProgressSchema>;

// a declarable protocol version; the YAML value must be a string
export const ProtocolVersionSchema = z.enum(PROTOCOL_VERSIONS);

export type IProtocolVersion = z.infer<typeof ProtocolVersionSchema>;

// a 0.2 plan's priority
export const PrioritySchema = z.enum(PRIORITY_VALUES);

export type IPriority = z.infer<typeof PrioritySchema>;

// a repository as its remote names it, owner/name; identifiers compare without regard to case
export const RepositoryIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/)
  .refine((value) => !['.', '..'].includes(value.split('/')[1]!));

export type IRepositoryId = z.infer<typeof RepositoryIdSchema>;

// the repositories a 0.2 plan changes, each listed once regardless of case
export const RepositoriesSchema = z
  .array(RepositoryIdSchema)
  .min(1)
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length);

// a repository-relative POSIX path: no leading slash, backslash, or empty, '.', or '..' segment
const RegistryPathSchema = z
  .string()
  .refine(
    (path) =>
      !path.includes('\\') &&
      !path.includes('\0') &&
      path.split('/').every((segment) => !['', '.', '..'].includes(segment)),
  );

// an inclusive range of error codes a plan adds to one registry of one repository
export const ErrorCodeRangeSchema = z
  .strictObject({
    repository: RepositoryIdSchema,
    registry: RegistryPathSchema,
    first: z.int(),
    last: z.int(),
  })
  .refine((range) => range.first <= range.last);

export type IErrorCodeRange = z.infer<typeof ErrorCodeRangeSchema>;

// the error code ranges a 0.2 plan adds
export const ErrorCodesSchema = z.array(ErrorCodeRangeSchema);

/** Optional 0.2 fields, validated apart from the shared metadata so 0.1 results stay unchanged. */
export type IPlanScopeMetadata = {
  priority?: IPriority;
  repositories?: IRepositoryId[];
  error_codes?: IErrorCodeRange[];
};

/** Preferred new-plan metadata. Unknown project fields remain allowed. */
export const PlanMetadataSchema = z.looseObject({
  id: NonblankStringSchema,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: NonblankStringSchema,
  protocol: ProtocolVersionSchema.exactOptional(),
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

/**
 * Only explicitly supplied core and 0.2 scope fields are changed; no implicit revision or timestamp
 * bump. A null scope field removes it.
 */
export const PlanSetSchema = z
  .strictObject({
    id: PlanMetadataSchema.shape.id.exactOptional(),
    created_at: PlanMetadataSchema.shape.created_at.exactOptional(),
    updated_at: PlanMetadataSchema.shape.updated_at.exactOptional(),
    revision: PlanMetadataSchema.shape.revision.exactOptional(),
    status: PlanMetadataSchema.shape.status.exactOptional(),
    priority: PrioritySchema.nullable().exactOptional(),
    repositories: RepositoriesSchema.nullable().exactOptional(),
    error_codes: ErrorCodesSchema.nullable().exactOptional(),
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
