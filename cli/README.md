# CLI

**Development preview.** The read-only executable is implemented and tested from the packed archive. A public npm release is not yet advertised.

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

Data includes the resolved directory and per-document observations; check also includes conforms. Diagnostics have stable codes, severity, document, message, and an optional source location. Error is null or a safe code/message pair. Operational failure can retain partial data. Source locations use UTF-16 character offsets and one-based lines/columns. The JSON contract is versioned independently of the protocol.

| Exit | Meaning                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------- |
| 0    | Inspection completed, including absence or document-format/encoding findings; or check found no errors.           |
| 1    | Explicit check found conformance errors.                                                                          |
| 2    | Invalid command/arguments or operational failure, including unreadable nonregular files and exceeded byte limits. |

Unknown/repeated flags, unsupported positionals, empty option values, and unsafe byte limits fail rather than silently changing the command. `--include-body` applies only to inspect.

See the [library API](../api/README.md), [error reference](../errors/README.md), and [protocol](../protocol/0.1/README.md).
