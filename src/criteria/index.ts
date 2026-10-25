// types
export type { ICriteriaObservation, ICriterion, ICriterionCoverage } from './types.ts';

// constants (package-private)
export { COVERAGE_MARKER } from './constants.ts';

// observations; only observeCriteria is part of the package's public root exports
export { checkDefinitions, coverageIds, observeCriteria, readCriteria } from './criteria.ts';
