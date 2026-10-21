# CLI

**Development preview.** The executable is implemented and tested from the packed archive. A public npm release is not yet advertised.

```sh
jg-plans inspect --directory ./jg-plans/example
jg-plans inspect --directory ./custom-root/example --json
jg-plans inspect --directory ./coding-agent-planning/example --include-body --json
jg-plans check --directory ./jg-plans/example --json
jg-plans --help
jg-plans --version
```

## Inspect

Inspect reads only the selected plan.md and optional milestones.md. It reports readable, missing, or unreadable files, recognized metadata and progress, and useful partial observations. Unknown metadata and custom status strings remain visible. It does not read history, discover other plans, restore deleted files, or infer permission or completion from absence.

Bodies and complete document sources are excluded by default. `--include-body` explicitly includes them for inspect. Metadata, titles, markers, and locations remain part of ordinary observations.

## Check

Check is an optional assessment against the preferred protocol writer format. Missing required metadata, malformed structures, duplicate markers, and overview discrepancies produce findings. Milestone IDs and overview tables remain optional. A missing milestone file is valid for a plan-only task. A checker result is never an execution approval or a restriction on manual editing.

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

Slug and root are command flags, not JSON fields. Creation uses ./jg-plans relative to the working directory by default, without root discovery or migration. It creates an exclusive timestamp_slug directory, defaults missing metadata, preserves supplied body/milestones, and never overwrites. Slugs use lowercase ASCII kebab case; the generated component must fit 64 characters. Returned create data contains directory, plan metadata/rawMetadata, and milestone summaries or null. No body is emitted.

Update input selects one document. For a plan, use `{ "document": "plan", "set": { "status": "done", "revision": 2 } }`. The only allowed fields are id, created_at, updated_at, revision, and status. For milestones:

```json
{
  "document": "milestones",
  "changes": [{ "select": { "ordinal": 1 }, "set": { "status": "done" } }]
}
```

Select by ordinal or UUID id, with one change per target. Set status and/or UUID id. The result contains directory, document, and changed. Equal values skip the write. Revision/timestamps never advance implicitly. Overview rows, prose, and extension metadata remain byte-identical. Missing selected files are not recreated. Existing misplaced markers remain in place with diagnostics; new markers require canonical insertion points.

Input comes from a file or `-` for stdin and must be valid UTF-8 JSON, at most 1 MiB by default. `--max-bytes` overrides both mutation-input and selected-document limits. Unknown JSON fields, nonconforming requested core values, invalid encoding, unsupported YAML, ambiguous edits, destination collisions, detected source changes, and I/O failures exit 2. Unsupported edits explain the case in error.data.reason; cleanup failures report owned paths. See [the API](../api/README.md) for precise preservation and unsupported-edit limits.

Serialize commands that edit the same document, including the whole read/edit/write operation. A prior-content check detects observed intervening changes, but the comparison-to-rename race remains. The CLI supplies no lock, queue, retry, or history service.

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

Inspect data includes the resolved directory and per-document observations; check also includes conforms. Mutation results are described above. Diagnostics have stable codes, severity, document, message, and an optional source location. Error is null or a safe code/message pair with optional data for a reason, affected core field, or cleanupFailedPaths. Causes are not emitted. Operational inspection failure can retain partial data. Source locations use UTF-16 character offsets and one-based lines/columns. The JSON contract is versioned independently of the protocol.

| Exit | Meaning                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0    | Inspection completed, including absence or document-format/encoding findings; a mutation succeeded; or check found no errors. |
| 1    | Explicit check found conformance errors.                                                                                      |
| 2    | Invalid command/arguments or operational failure, including unreadable nonregular files and exceeded byte limits.             |

Unknown/repeated flags, unsupported positionals, empty option values, and unsafe byte limits fail rather than silently changing the command. `--include-body` applies only to inspect.

See the [library API](../api/README.md), [error reference](../errors/README.md), and [protocol](../protocol/0.1/README.md).
