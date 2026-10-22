export { checkPlan, parseMilestones, parsePlan, fingerprintPlan } from './documents/index.ts';
export type {
  ICheckResult,
  IFrontmatter,
  IMarker,
  IMilestone,
  IOverviewRow,
  IParsedMilestones,
  IParsedPlan,
  ISourceSpan,
  IHeadingSection,
  IPlanFingerprint,
} from './documents/index.ts';
export { ERRORS } from './errors/index.ts';
export { inspectPlan } from './files/index.ts';
export { createPlan, updatePlan } from './files/index.ts';
export type { IDocumentRead, IPlanInspection } from './files/index.ts';
export type { IPlanCreation, IPlanUpdateResult } from './files/index.ts';
export {
  PROTOCOL_VERSION,
  DiagnosticSchema,
  PlanDocumentsSchema,
  PlanMetadataSchema,
  ReadOptionsSchema,
  PlanFingerprintOptionsSchema,
  PlanFingerprintSchema,
  InspectPlanOptionsSchema,
  SourceLocationSchema,
} from './protocol/index.ts';
export type {
  IDiagnostic,
  IPlanDocuments,
  IPlanMetadata,
  IReadOptions,
  IPlanFingerprintOptions,
  IInspectPlanOptions,
  ISourceLocation,
} from './protocol/index.ts';
export {
  CreatePlanOptionsSchema,
  MilestoneSelectorSchema,
  MilestoneSetSchema,
  PlanSetSchema,
  PlanUpdateSchema,
} from './protocol/index.ts';
export type { ICreatePlanOptions, IPlanUpdate } from './protocol/index.ts';
