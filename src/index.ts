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
export { observeCriteria } from './criteria/index.ts';
export type { ICriteriaObservation, ICriterion, ICriterionCoverage } from './criteria/index.ts';
export { ERRORS } from './errors/index.ts';
export { inspectPlan } from './files/index.ts';
export {
  createPlan,
  updatePlan,
  writePlanDocument,
  removeMilestones,
  withPlanDocumentLocks,
} from './files/index.ts';
export { preparePlanUpdate, preparePlanDocumentWrite } from './edits/index.ts';
export type { IPreparedPlanEdit, IAssignedMilestoneId } from './edits/index.ts';
export type { IDocumentRead, IPlanInspection } from './files/index.ts';
export type {
  IPlanCreation,
  IPlanUpdateResult,
  IPlanDocumentWriteResult,
  IRemoveMilestonesResult,
} from './files/index.ts';
export {
  PROGRESS_VALUES,
  PROTOCOL_VERSION,
  PROTOCOL_VERSIONS,
  CriterionIdSchema,
  DiagnosticSchema,
  PlanDocumentsSchema,
  PlanMetadataSchema,
  ProgressSchema,
  ProtocolVersionSchema,
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
  IProgress,
  IProtocolVersion,
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
  PlanDocumentWriteSchema,
  RemoveMilestonesSchema,
} from './protocol/index.ts';
export type {
  ICreatePlanOptions,
  IPlanUpdate,
  IPlanDocumentWrite,
  IRemoveMilestones,
} from './protocol/index.ts';
