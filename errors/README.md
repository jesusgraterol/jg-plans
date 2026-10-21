# Error reference

Document-format diagnostics are observations. They are separate from the operational ERRORS catalog and do not prohibit manual work.

| Export        | Stable code            | Stable message                          | Exposure                                                                             |
| ------------- | ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| INVALID_INPUT | JG_PLANS_INVALID_INPUT | Invalid jg-plans input                  | Invalid public operation arguments; invalid CLI command/flags/limits exit 2.         |
| READ_FAILED   | JG_PLANS_READ_FAILED   | The selected document could not be read | CLI operational failures exit 2; partial inspection data is retained when available. |

parsePlan, parseMilestones, checkPlan, and inspectPlan can throw INVALID_INPUT for incompatible operation arguments. Inspection returns file failures as diagnostics rather than throwing away another readable document. Error causes from argument parsing remain internal; machine output exposes only a safe code and stable message, never the plan body.

## Document diagnostics

- Plan structure: MISSING_FRONTMATTER, UNTERMINATED_FRONTMATTER, INVALID_YAML, YAML_WARNING, YAML_VALUE_UNAVAILABLE, METADATA_NOT_MAPPING, MISSING_METADATA_FIELD, INVALID_METADATA_FIELD.
- Availability: MISSING_PLAN, MISSING_MILESTONES, ORPHAN_MILESTONES, UNREADABLE_DOCUMENT, FILE_TOO_LARGE, INVALID_ENCODING.
- Milestones: NO_MILESTONES, INVALID_ORDINAL, NONSEQUENTIAL_ORDINAL, DUPLICATE_ORDINAL, EMPTY_MILESTONE_TITLE, MISSING_STATUS, EMPTY_STATUS, DUPLICATE_STATUS, MISPLACED_STATUS, DUPLICATE_ID_MARKER, INVALID_MILESTONE_ID, DUPLICATE_ID, MISPLACED_ID, AMBIGUOUS_OVERVIEW, OVERVIEW_MISMATCH.

Severity belongs to each observation. Missing optional milestones are informational; orphan milestones, YAML warnings/unavailable expansions, and sequence gaps are warnings. Preferred-writer defects are errors. Inspect still exits 0 for completed format observations. Explicit check exits 1 for error diagnostics. Unreadable/nonregular files and byte-limit failures are operational CLI failures (exit 2), while invalid encoding remains a returned document-format observation during inspection.

Diagnostics identify a document and, when possible, a UTF-16 character offset plus one-based line/column. Messages describe the issue without embedding source snippets. The original source remains available from readable library results or explicit CLI body inclusion.
