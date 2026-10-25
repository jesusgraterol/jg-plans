# CLI

The executable is tested from the packed archive. Check the [website's availability label](https://jg-plans.jesusgraterol.dev/docs/cli/) for published-package availability, or run the built executable from a checkout.

```sh
jg-plans inspect --directory ./jg-plans/example
jg-plans inspect --directory ./custom-root/example --json
jg-plans inspect --directory ./jg-plans/example --fingerprint-exclude '["created_at","updated_at","revision","status"]' --json
jg-plans inspect --directory ./coding-agent-planning/example --include-body --json
jg-plans check --directory ./jg-plans/example --json
jg-plans --help
jg-plans --version
```

## Inspect

Inspect reads only the selected plan.md and optional milestones.md. It reports readable, missing, or unreadable files, recognized metadata and progress, and useful partial observations. Unknown metadata and custom status strings remain visible. It does not read history, discover other plans, restore deleted files, or infer permission or completion from absence.

Bodies and complete document sources are excluded by default. `--include-body` explicitly includes them for inspect, including the whole milestone document body. Raw metadata for both documents, titles, markers, locations, source ranges, and exact-byte SHA-256 values for readable files remain part of ordinary observations.

Acceptance criteria are ordinary observations too. `data.plan.protocol` is `0.2` or `0.1`, and `data.plan.criteria` lists every criterion definition with its ID, text, and location. Each milestone entry has `criteria` and `criteriaMarkers` from its coverage line. `data.criteria` holds each valid criterion's covering milestones and derived progress, or null when plan.md is unreadable or missing, or milestones.md is unreadable. See [criteria and progress](../api/README.md#criteria-and-progress).

`--fingerprint-exclude <JSON-array>` requests a structural plan fingerprint and supplies its explicit top-level metadata exclusions. Pass `[]` to cover every key. The array must contain strings; duplicate keys are applied once. This flag is accepted only by inspect. The result includes `data.fingerprint` with sha256, the unique applied keys, and diagnostics. Invalid framing/YAML or unavailable structure yields a null fingerprint without hiding useful observations. It is an observation, never permission or a conformance gate. See [structural fingerprints](../api/README.md#structural-fingerprints).

## Check

Check is an optional assessment against the preferred protocol writer format. Missing required metadata, malformed structures, duplicate markers, and overview discrepancies produce findings. Milestone IDs and overview tables remain optional. A missing milestone file is valid for a plan-only task. A checker result is never an execution approval or a restriction on manual editing.

For a plan that declares `protocol: "0.2"`, check also reports missing, invalid, duplicate, or empty criteria, statuses other than pending, in progress, or done, malformed or misplaced coverage lines, unknown IDs, and criteria no milestone covers. Plans without that marker get exactly the 0.1 findings. Inspect reports the same criteria findings without failing.

## Create and update

```sh
jg-plans create --slug small-change --input create.json --json
jg-plans create --slug small-change --root ./custom-root --input - --json
jg-plans update --directory ./jg-plans/example --input update.json --json
```

Create input is a closed JSON object with body, optional metadata, and optional milestones text:

```json
{
  "body": "# Intent\n\nKeep this prose.\n",
  "metadata": { "project": { "owner": "example" } },
  "milestones": "## Milestone 1: Implement\n**Status:** pending\n"
}
```

Slug and root are command flags, not JSON fields. Creation uses ./jg-plans relative to the working directory by default, without root discovery or migration. It creates an exclusive timestamp_slug directory, defaults missing metadata, preserves supplied body/milestones, and never overwrites. Slugs use lowercase ASCII kebab case; the generated component must fit 64 characters. Returned create data contains directory, plan metadata/rawMetadata/sha256, and milestones as { sha256, milestones: summaries } or null. No body is emitted.

Update input selects one document and optionally expectedSha256 from a fresh inspection; a stale or deleted guarded target fails before preparation. For a plan, use `{ "document": "plan", "set": { "status": "done", "revision": 2 } }`. The only allowed fields are id, created_at, updated_at, revision, and status. For milestones:

```json
{
  "document": "milestones",
  "changes": [{ "select": { "ordinal": 1 }, "set": { "status": "done" } }]
}
```

Select by ordinal or UUID id, with one change per target. Set status and/or UUID id. The result contains directory, document, changed, sha256, and assignedMilestoneIds (empty for narrow updates). Equal values skip the write. Revision/timestamps never advance implicitly. Overview rows, prose, and extension metadata remain byte-identical. Missing selected files are not recreated. Existing misplaced markers remain in place with diagnostics; new markers require canonical insertion points.

Input comes from a file or `-` for stdin and must be valid UTF-8 JSON, at most 1 MiB by default. `--max-bytes` overrides both mutation-input and selected-document limits. Unknown JSON fields, nonconforming requested core values, invalid encoding, unsupported YAML, ambiguous edits, destination collisions, detected source changes, and I/O failures exit 2. Unsupported edits explain the case in error.data.reason; cleanup failures report owned paths. See [the API](../api/README.md) for precise preservation and unsupported-edit limits.

All mutations share local document locks with library/HQ consumers. Busy and dead owners fail immediately; recovery requires explicit operator inspection. A prior-content check detects observed intervening changes, but nonparticipating writers retain a comparison-to-rename race. Release failures report uncertain mutation outcomes even when bytes were written. There is no cross-document transaction, automatic retry, or history service.

## Write and remove milestones

```sh
jg-plans write --directory ./jg-plans/example --input write.json --json
jg-plans remove-milestones --directory ./jg-plans/example --input remove.json --json
```

Write accepts PlanDocumentWriteSchema. For plan bodies, use `{ "document": "plan", "expectedSha256": "<observed 64-character lowercase hash>", "body": "# Revised intent\n", "set": { "revision": 2 } }`. Set is optional and changes only core metadata. Body-only writes can preserve closed malformed YAML; unterminated framing fails. Unaffected frontmatter, BOM, and permissions are retained.

For complete milestone replacement use `{ "document": "milestones", "expectedSha256": "<observed hash>", "source": "## Milestone 1: Work\n**Status:** pending\n", "assignMissingIds": true }`. Null expectedSha256 explicitly creates an absent milestone file exclusively. Existing expectations never recreate deleted targets. UUID assignment is opt-in, preserves valid IDs, and rejects ambiguous identities/insertion points. Write output includes directory, document, changed, sha256, and assignedMilestoneIds, never full source.

Remove input is `{ "expectedSha256": "<observed milestone hash>" }`. Only matching regular UTF-8 milestones.md is removed; absent/stale targets fail SOURCE_CHANGED. Successful data contains directory, document milestones, changed true, and sha256 null. No plan, directory, or coordination file is removed.

The placeholders above must be replaced with actual hashes returned by inspect/create or a preceding mutation. Every command uses the same input limits, safe errors, envelope, and exits. See [the API](../api/README.md#pure-preparation-and-guarded-document-writes) for source preservation and [shared document locks](../api/README.md#shared-document-locks).

## Limits and output

`--max-bytes <positive-safe-integer>` overrides the default 1048576-byte per-file bound. Inputs must be valid UTF-8; invalid bytes are diagnosed without replacement/transcoding. Help and version do not read selected plan files.

Human output uses stdout for data and stderr for diagnostics. `--json` emits exactly one JSON envelope on stdout and no human/progress messages:

```json
{
  "schemaVersion": 1,
  "command": "inspect",
  "data": {},
  "diagnostics": [],
  "error": null
}
```

Inspect data includes the resolved directory, per-document observations, and criteria; check also includes conforms. Mutation results are described above. Diagnostics have stable codes, severity, document, message, and an optional source location. Error is null or a safe code/message pair with optional data for a reason, affected core field, or cleanupFailedPaths. Causes are not emitted. Operational inspection failure can retain partial data. Source locations use UTF-16 character offsets and one-based lines/columns. The JSON contract is versioned independently of the protocol.

| Exit | Meaning                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0    | Inspection completed, including absence or document-format/encoding findings; a mutation succeeded; or check found no errors. |
| 1    | Explicit check found conformance errors.                                                                                      |
| 2    | Invalid command/arguments or operational failure, including unreadable nonregular files and exceeded byte limits.             |

Unknown/repeated flags, unsupported positionals, empty option values, and unsafe byte limits fail rather than silently changing the command. `--include-body` applies only to inspect.

See the [library API](../api/README.md), [error reference](../errors/README.md), and [protocol](../protocol/0.1/README.md).
