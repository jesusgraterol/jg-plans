// a criterion definition: up to three spaces, a list marker, spacing, an AC- ID, and a colon
export const DEFINITION_PATTERN = /^( {0,3})(?:[-*+]|\d{1,9}[.)])[ \t]+(AC-[^\s:]*):(.*)$/;

// a list item at any indentation, which ends a criterion's continuation text
export const LIST_ITEM_PATTERN = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;

// an ATX heading, which ends a criterion's continuation text
export const HEADING_PATTERN = /^ {0,3}#{1,6}(?:[ \t]|$)/;

// the coverage line prefix inside a milestone
export const COVERAGE_MARKER = '**Acceptance criteria:**';
