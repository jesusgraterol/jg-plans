// Byte-editing primitives stay package-private; consumers can prepare edits without filesystem I/O.
export { applyEdits, decodeSource, encodeSource, milestoneEdits, planEdits } from './utilities.ts';
export { preparePlanUpdate, preparePlanDocumentWrite } from './preparations.ts';
export type { IPreparedPlanEdit, IAssignedMilestoneId } from './types.ts';
