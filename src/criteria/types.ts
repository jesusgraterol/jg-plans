import type { ISourceSpan } from '../documents/index.ts';
import type {
  IDiagnostic,
  IProgress,
  IProtocolVersion,
  ISourceLocation,
} from '../protocol/index.ts';

// one criterion definition; an invalid ID stays observable as written, with a null id
export type ICriterion = {
  id: string | null;
  idText: string;
  text: string;
  location: ISourceLocation;
  range: ISourceSpan;
};

// a valid criterion with the milestones that cover it and its derived progress
export type ICriterionCoverage = {
  id: string;
  text: string;
  location: ISourceLocation;
  milestones: { ordinal: number | null; id: string | null }[];
  progress: IProgress | null;
};

// cross-document criteria observations under the current protocol
export type ICriteriaObservation = {
  protocol: IProtocolVersion;
  criteria: ICriterionCoverage[];
  diagnostics: IDiagnostic[];
};
