import type { IDiagnostic } from '../protocol/index.ts';

/** Internal UTF-16 source spans, converted to original byte offsets before replacement. */
export type ITextEdit = { start: number; end: number; replacement: string };
/** IDs generated only by an explicit missing-ID assignment request. */
export type IAssignedMilestoneId = { ordinal: number; id: string };

/** In-memory preparation performs no filesystem operation or implicit policy update. */
export type IPreparedPlanEdit = {
  source: string;
  changed: boolean;
  sha256: string;
  diagnostics: IDiagnostic[];
  assignedMilestoneIds: IAssignedMilestoneId[];
};
