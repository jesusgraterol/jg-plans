export { inspectPlan } from './utilities.ts';
export { createPlan, updatePlan } from './mutations.ts';
export { writePlanDocument, removeMilestones } from './documents.ts';
export { withPlanDocumentLocks } from './locks.ts';
// overlap reads (package-private: the CLI's overlaps command)
export { OVERLAP_MAX_FOLDERS, OVERLAP_READ_BYTES, readOverlapPlans } from './overlaps.ts';
export type { IDocumentRead, IOverlapRead, IPlanInspection, IUnreadablePlan } from './types.ts';
export type {
  IPlanCreation,
  IPlanUpdateResult,
  IPlanDocumentWriteResult,
  IRemoveMilestonesResult,
} from './types.ts';
