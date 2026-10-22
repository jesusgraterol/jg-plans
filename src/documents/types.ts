import type { IDiagnostic, IPlanMetadata, ISourceLocation } from '../protocol/index.ts';

/** Original-source UTF-16 offsets, with an exclusive end. */
export type ISourceSpan = { start: number; end: number };

/** One unfenced level-two heading and all text up to the next such heading. */
export type IHeadingSection = {
  title: string;
  heading: ISourceSpan;
  body: ISourceSpan;
};

/** Read models retain original text and partial observations; diagnostics carry ambiguity. */
export type IFrontmatter = {
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
  closed: boolean;
};

export type IParsedPlan = {
  source: string;
  body: string;
  frontmatter: IFrontmatter | null;
  rawMetadata: unknown;
  metadata: Partial<IPlanMetadata>;
  preamble: ISourceSpan;
  sections: IHeadingSection[];
  diagnostics: IDiagnostic[];
};

export type IMarker = {
  value: string;
  location: ISourceLocation;
  valueStart: number;
  valueEnd: number;
  lineStart: number;
  lineEnd: number;
};

export type IMilestone = {
  ordinal: number | null;
  ordinalText: string;
  title: string;
  status: string | null;
  id: string | null;
  location: ISourceLocation;
  headingEnd: number;
  end: number;
  body: string;
  statusMarkers: IMarker[];
  idMarkers: IMarker[];
};

export type IOverviewRow = {
  ordinal: number | null;
  ordinalText: string;
  name: string;
  status: string;
  location: ISourceLocation;
};

export type IParsedMilestones = {
  source: string;
  body: string;
  frontmatter: IFrontmatter | null;
  rawMetadata: unknown;
  preamble: ISourceSpan;
  sections: IHeadingSection[];
  overviewTables: ISourceSpan[];
  milestones: IMilestone[];
  overview: IOverviewRow[];
  overviewPresent: boolean;
  diagnostics: IDiagnostic[];
};

export type ICheckResult = { conforms: boolean; diagnostics: IDiagnostic[] };

/** A structural observation; consumers decide exclusions and authorization policy. */
export type { IPlanFingerprint } from '../protocol/index.ts';

export type ISourceLine = {
  text: string;
  start: number;
  end: number;
  fullEnd: number;
  number: number;
  fenced: boolean;
};
