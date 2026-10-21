import type { IParsedMilestones, IParsedPlan } from '../documents/index.ts';
import type { IDiagnostic } from '../protocol/index.ts';

/** Availability is independent per document; absence never implies approval or completion. */
export type IDocumentRead<TDocument> =
  | { state: 'readable'; path: string; value: TDocument }
  | { state: 'missing'; path: string }
  | { state: 'unreadable'; path: string; diagnostics: IDiagnostic[] };

export type IPlanInspection = {
  directory: string;
  plan: IDocumentRead<IParsedPlan>;
  milestones: IDocumentRead<IParsedMilestones>;
  diagnostics: IDiagnostic[];
};

/** Creation returns original generated/supplied sources and their useful observations. */
export type IPlanCreation = {
  directory: string;
  plan: IParsedPlan;
  milestones: IParsedMilestones | null;
  diagnostics: IDiagnostic[];
};

/** An update reports only its selected document; it does not inspect unrelated files. */
export type IPlanUpdateResult = {
  directory: string;
  document: 'plan' | 'milestones';
  changed: boolean;
  diagnostics: IDiagnostic[];
};
