import type { ICriteriaObservation } from '../criteria/index.ts';
import type { IParsedMilestones, IParsedPlan, IPlanFingerprint } from '../documents/index.ts';
import type { IPreparedPlanEdit } from '../edits/index.ts';
import type { IOverlapPlan } from '../overlaps/index.ts';
import type { IDiagnostic } from '../protocol/index.ts';

/** Availability is independent per document; absence never implies approval or completion. */
export type IDocumentRead<TDocument> =
  | { state: 'readable'; path: string; sha256: string; value: TDocument }
  | { state: 'missing'; path: string }
  | { state: 'unreadable'; path: string; diagnostics: IDiagnostic[] };

export type IPlanInspection = {
  directory: string;
  plan: IDocumentRead<IParsedPlan>;
  milestones: IDocumentRead<IParsedMilestones>;
  // null unless plan.md is readable and milestones.md is readable or missing
  criteria: ICriteriaObservation | null;
  fingerprint?: IPlanFingerprint;
  diagnostics: IDiagnostic[];
};

/** Creation returns original generated/supplied sources and their useful observations. */
export type IPlanCreation = {
  directory: string;
  plan: IParsedPlan & { sha256: string };
  milestones: (IParsedMilestones & { sha256: string }) | null;
  diagnostics: IDiagnostic[];
};

/** An update reports only its selected document; it does not inspect unrelated files. */
export type IPlanUpdateResult = Omit<IPreparedPlanEdit, 'source'> & {
  directory: string;
  document: 'plan' | 'milestones';
};

/** Guarded source writes have the same digest/assignment result as narrow updates. */
export type IPlanDocumentWriteResult = IPlanUpdateResult;

export type IRemoveMilestonesResult = {
  directory: string;
  document: 'milestones';
  changed: true;
  sha256: null;
  diagnostics: IDiagnostic[];
};

/** A plan folder whose frontmatter an overlap read couldn't use, and why. */
export type IUnreadablePlan = {
  directory: string;
  reason:
    | 'not-a-file'
    | 'frontmatter-too-large'
    | 'invalid-frontmatter'
    | 'invalid-error-codes'
    | 'invalid-encoding'
    | 'read-failed';
};

/** What an overlap read covered; it is complete only when every folder under the limit was read. */
export type IOverlapRead = {
  plans: IOverlapPlan[];
  unreadable: IUnreadablePlan[];
  isComplete: boolean;
};
