export { checkPlan } from './check.ts';
export { parseMilestones } from './milestones.ts';
export { parsePlan } from './plan.ts';
export { fingerprintPlan } from './fingerprints.ts';
// Package-private lexical support; omitted from the package's public root exports.
export { sourceLines } from './utilities.ts';
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
} from './types.ts';
