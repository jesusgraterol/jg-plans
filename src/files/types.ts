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
