# Error reference

Document-format diagnostics are observations. They are separate from the operational ERRORS catalog and do not prohibit manual work.

| Export               | Stable code                   | Stable message                                 | Exposure                                                                                              |
| -------------------- | ----------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| INVALID_INPUT        | JG_PLANS_INVALID_INPUT        | Invalid jg-plans input                         | Invalid public operation arguments; invalid CLI command/flags/limits exit 2.                          |
| READ_FAILED          | JG_PLANS_READ_FAILED          | The selected document could not be read        | CLI operational failures exit 2; partial inspection data is retained when available.                  |
| UNSUPPORTED_ENCODING | JG_PLANS_UNSUPPORTED_ENCODING | Document text is not valid UTF-8               | Mutation input/source contains invalid UTF-8 or replacement text contains unpaired surrogates.        |
| UNSAFE_EDIT          | JG_PLANS_UNSAFE_EDIT          | The requested edit is unsupported or ambiguous | Unsupported affected YAML/marker structure, selector ambiguity, or invalid spans; nothing is written. |
| DESTINATION_EXISTS   | JG_PLANS_DESTINATION_EXISTS   | The plan destination already exists            | Exclusive creation refuses an existing path.                                                          |
| SOURCE_CHANGED       | JG_PLANS_SOURCE_CHANGED       | The document changed before replacement        | A prior-content comparison observed different bytes; no retry occurs.                                 |
| WRITE_FAILED         | JG_PLANS_WRITE_FAILED         | The plan document could not be written         | Creation or replacement failed; inspect any cleanupFailedPaths.                                       |

parsePlan, parseMilestones, checkPlan, and inspectPlan can throw INVALID_INPUT for incompatible operation arguments. Inspection returns file failures as diagnostics rather than throwing away another readable document. createPlan can throw INVALID_INPUT, UNSUPPORTED_ENCODING, DESTINATION_EXISTS, and WRITE_FAILED. updatePlan can throw INVALID_INPUT, READ_FAILED, UNSUPPORTED_ENCODING, UNSAFE_EDIT, SOURCE_CHANGED, and WRITE_FAILED. Mutation failures exit 2 in the CLI.

Stable messages exclude user text. Internal causes may retain detailed provider errors and are never emitted by the CLI. Public error.data may contain a safe provider/unsupported-edit reason, an affected core field, or cleanupFailedPaths. For example, unsupported-metadata-value means an affected scalar uses an unsupported form, and noncanonical-id-insertion means a new ID cannot be inserted after a canonical status marker. Reason details refine the stable operational code; they do not quote source. Failed JSON parsing also omits the unsafe syntax-error cause.

Failed creation cleans only still-recognizable owned partial files and its empty plan directory. If user edits or I/O failures prevent that cleanup, paths are reported without deleting intervening content. The selected storage root can remain empty. Updates never recreate missing documents, rewrite bodies, or recover history. The [API](../api/README.md) documents conservative YAML forms and caller coordination requirements.

## Document diagnostics

- Plan structure: MISSING_FRONTMATTER, UNTERMINATED_FRONTMATTER, INVALID_YAML, YAML_WARNING, YAML_VALUE_UNAVAILABLE, METADATA_NOT_MAPPING, MISSING_METADATA_FIELD, INVALID_METADATA_FIELD.
- Availability: MISSING_PLAN, MISSING_MILESTONES, ORPHAN_MILESTONES, UNREADABLE_DOCUMENT, FILE_TOO_LARGE, INVALID_ENCODING.
- Milestones: NO_MILESTONES, INVALID_ORDINAL, NONSEQUENTIAL_ORDINAL, DUPLICATE_ORDINAL, EMPTY_MILESTONE_TITLE, MISSING_STATUS, EMPTY_STATUS, DUPLICATE_STATUS, MISPLACED_STATUS, DUPLICATE_ID_MARKER, INVALID_MILESTONE_ID, DUPLICATE_ID, MISPLACED_ID, AMBIGUOUS_OVERVIEW, OVERVIEW_MISMATCH.

Severity belongs to each observation. Missing optional milestones are informational; orphan milestones, YAML warnings/unavailable expansions, and sequence gaps are warnings. Preferred-writer defects are errors. Inspect still exits 0 for completed format observations. Explicit check exits 1 for error diagnostics. Unreadable/nonregular files and byte-limit failures are operational CLI failures (exit 2), while invalid encoding remains a returned document-format observation during inspection.

Diagnostics identify a document and, when possible, a UTF-16 character offset plus one-based line/column. Messages describe the issue without embedding source snippets. The original source remains available from readable library results or explicit CLI body inclusion.
