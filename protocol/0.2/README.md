# jg-plans protocol 0.2

**Status:** provisional draft

A compact Markdown protocol for plans, their acceptance criteria, and optional milestones. People own their files and can edit, move, shorten, or delete them. The protocol describes documents and observations; projects decide how to approve and execute work.

Protocol 0.2 is the only supported protocol. Readers apply its rules to unversioned Markdown as well. An explicit unsupported version receives a diagnostic while its source and raw metadata remain available; readers never rewrite the version marker automatically.

## Writers and readers

The preferred writer format below defines conformance for newly generated documents. Readers accept useful existing Markdown without requiring conformance. An explicit checker may report deviations, but inspection and otherwise safe edits do not run that checker as a prerequisite.

A diagnostic explains an observation. It does not authorize work, establish completion, or prohibit someone from editing a file manually.

## Documents and placement

The conventional layout is:

```text
jg-plans/<id>/
  plan.md
  milestones.md   optional
```

A consumer honors an explicitly chosen planning root. Otherwise it preserves the repository's established root, including coding-agent-planning/ or a custom location, and uses jg-plans/ for a new default. It does not move existing plans automatically. Placement is a convention, not document identity or a central registry.

The reference CLI's create --root default is ./jg-plans relative to the invocation directory. It uses explicit paths and does not discover a repository's established root on its own. The one read beyond a selected plan folder is `overlaps`, which lists the plan folders of the roots the caller names.

The reference implementation supports UTF-8 Markdown, with an optional UTF-8 BOM. Invalid UTF-8 and unsupported encodings produce diagnostics. They are not silently transcoded. This implementation boundary does not require every protocol consumer to share the same file-size limit.

## Plan metadata

A newly generated preferred plan starts with YAML frontmatter containing:

| Field      | Writer value                        | Meaning                                     |
| ---------- | ----------------------------------- | ------------------------------------------- |
| id         | Nonempty stable string              | Document identity independent of its path.  |
| created_at | RFC 3339 timestamp                  | Known creation time.                        |
| updated_at | RFC 3339 timestamp                  | The author's latest recorded revision time. |
| revision   | Positive integer                    | Author-maintained document revision.        |
| status     | `pending`, `in progress`, or `done` | Progress of the whole plan.                 |
| protocol   | The string `"0.2"`                  | Declares the supported protocol.            |

A 0.2 plan may also declare these optional fields:

| Field        | Writer value                                        | Meaning                                             |
| ------------ | --------------------------------------------------- | --------------------------------------------------- |
| priority     | `low`, `medium`, `high`, or `hotfix`                | How urgent the plan is.                             |
| repositories | A nonempty list of unique `owner/name` identifiers  | The repositories the plan changes.                  |
| error_codes  | A list of `{ repository, registry, codes }` entries | The explicit string or numeric error codes it adds. |

Each repository identifier is taken from the repository's remote, such as `acme/app` for `https://github.com/acme/app.git`, and identifiers compare without regard to case. In an `error_codes` entry, `repository` is such an identifier and `registry` is the repository-relative POSIX path of the error registry, without a leading `/`, a backslash, or an empty, `.`, or `..` segment. `codes` is an explicit list, for example `[100, "SEARCH_FILTER_INVALID"]`. Empty lists make no claims. Codes are nonblank strings or finite numbers; integer values must be safe JavaScript integers. Boolean, null, object, NaN, and infinite values are invalid. Entries accept no other fields.

Readers retain decoded numeric values and exact string text. Original source retains YAML spelling. Quote numeric-looking identifiers when spelling matters: YAML `0100` decodes to number `100` and `1e3` to number `1000`, while `"0100"` and `"1e3"` remain strings. No trimming, case folding, or Unicode normalization is applied to codes.

```markdown
---
id: 1792612920_search-feedback-criteria
created_at: 2026-10-21T20:02:00Z
updated_at: 2026-10-21T20:02:00Z
revision: 1
status: pending
protocol: '0.2'
---

# Search feedback

Explain empty search results and give people a useful next action.

## Acceptance criteria

- AC-01: Empty search results explain why nothing matched.
```

Quote the protocol value. An unquoted `0.2` is a YAML number and receives INVALID_METADATA_FIELD. An unsupported string receives UNSUPPORTED_PROTOCOL: "The declared plan protocol version is unsupported." A missing marker uses current rules without adding a field to the document. New reference-library plans declare `"0.2"` by default, and creation rejects an explicitly unsupported declaration before filesystem mutation.

Default ID generation uses Unix seconds plus a descriptive slug. Readers do not require that pattern, a UUID, or a project-specific identifier length.

The reference reader exposes a derived top-level `name`, separate from frontmatter. Decimal timestamp plus `_` plus a lowercase kebab-case slug yields the slug: `1792612920_search-feedback-criteria` becomes `search-feedback-criteria`. Other valid IDs yield the full ID, and absent or invalid IDs yield null. Names need not be unique; `id` remains identity. A project-owned metadata field named `name` is preserved independently. Derivation changes neither bytes nor fingerprints.

Do not invent an unknown historical creation time. A revision is not a digest, approval token, or execution permission. The reference library changes revision and timestamp fields only when callers explicitly request those edits.

Read raw metadata independently from known-field validation. Preserve unknown keys and their source, and retain invalid known values as raw observations alongside diagnostics. Priority, repositories, and error codes are the protocol's optional fields; additional authorship, approval records, and other fields are consumer-owned extensions. Consumers may implement stricter local profiles if they identify that strictness as project policy.

Protocol versions are independent of npm package versions.

## Plan body

Keep the body ordinary Markdown. Use the context a task needs: objective, scope, decisions, approach, validation, risks, and acceptance criteria. Small plans can be short. No fixed heading inventory is required.

A 0.2 plan defines at least one acceptance criterion, as described next. Everything else in the body stays free-form.

Do not infer that a plan was approved from a status, revision, directory, timestamp, or missing text. Approval and execution remain application/workflow concerns.

## Acceptance criteria

An acceptance criterion is a testable requirement with a stable ID. Criteria give people, skills, and applications one way to refer to the same requirement across reviews and revisions.

```markdown
## Acceptance criteria

- AC-01: Empty search results explain why nothing matched.
- AC-02: The empty state offers one next action,
  such as clearing the active filters.
```

A criterion definition is one line of the plan.md body, outside fenced code, made of:

1. up to three spaces of indentation;
2. a list marker: `-`, `*`, `+`, or one to nine digits followed by `.` or `)`;
3. one or more spaces or tabs;
4. an ID that begins with `AC-`, followed by a colon.

Valid IDs are `AC-01` to `AC-99`, then `AC-100` and up, without extra leading zeros. `AC-1` and `AC-001` are definitions with an invalid ID. Lowercase `ac-01` does not begin a definition.

The criterion's text is the rest of its line after the colon, plus each following line that is indented further than the list marker and is not blank, fenced, a heading, or another list item. Each line is trimmed and the lines are joined with single spaces, so the second criterion above reads "The empty state offers one next action, such as clearing the active filters."

Definitions can appear under any heading and in any language:

```markdown
## Criterios de aceptación

1. AC-01: Explicar por qué no hay resultados.
```

These never define a criterion:

- lines inside fenced code, including the frontmatter;
- block quotes, such as `> - AC-04: Quoted text`;
- lines indented four or more spaces;
- prose that mentions an ID, such as "Milestone 1 delivers AC-01.";
- anything in milestones.md.

An ID is the criterion's identity. When a criterion's wording changes, writers keep its ID; a new criterion takes the next unused number; IDs are never renumbered or reused within a plan. Readers see only the current document and cannot verify that history.

## Optional milestones

A plan does not need milestones. When reviewable units are useful, put them in milestones.md:

```markdown
## Milestone 1: Explain empty search results

**Status:** pending
**Milestone ID:** 5a148c73-7d38-4a2f-9c0f-903d93b9b764
**Acceptance criteria:** AC-01, AC-02

Describe the work, evidence, and review checkpoint.
```

Preferred writers use positive numbered headings in document order. The status marker is the first nonblank line after its heading. An optional milestone ID marker is the immediately following line after status, without a blank line between the two markers. New marker insertion uses that placement.

The status marker is the authoritative progress observation. In a 0.2 plan, every milestone status is `pending`, `in progress`, or `done`. A stable UUID milestone ID is recommended when identity across revisions matters; it is optional. Readers retain unrecognized status and ID text and diagnose incompatible values instead of discarding the entry.

Ignore headings and marker-like text inside fenced code. Diagnose duplicate ordinals, duplicate IDs, missing status lines, misplaced markers, and ambiguous structures while retaining unrelated readable entries. Gaps or partly deleted sequences do not recreate deleted milestones or establish completion.

An optional Overview table with Milestone, Name, and Status columns is derived from marker observations. Readers may diagnose discrepancies. They neither require the table nor rewrite it implicitly.

Caller-supplied milestone source remains verbatim. A caller generating that source follows writer rules; nonconforming supplied source receives diagnostics rather than automatic normalization. Updating a recognizable misplaced marker may preserve its location with a diagnostic; it does not claim to have repaired conformance.

## Milestone coverage

A milestone lists the criteria it delivers in one coverage line, `**Acceptance criteria:**`, placed directly after its ID line, or directly after its status line when it has no ID. In the example above, milestone 1 covers AC-01 and AC-02.

- The value is a comma-separated list of valid IDs, without repeats.
- A milestone that delivers no criterion omits the line.
- When milestones.md exists, every criterion appears on at least one coverage line. A criterion may appear on several.
- Without milestones.md, the whole plan covers every criterion.
- Coverage lines inside fenced code are ignored, like other markers.

A coverage line written directly after the status line stays correctly placed when a writer later inserts the ID line between them, as the reference library does when it assigns missing IDs.

## Criterion progress

Readers derive each criterion's progress, so every consumer shows the same value:

- Without milestones.md, a criterion's progress is the plan's status.
- With milestones.md, it is `done` when every milestone that covers it is done, `in progress` when at least one of them is in progress or done, and `pending` otherwise.
- It is unavailable (`null`) when no milestone covers the criterion, or when a status it depends on is not `pending`, `in progress`, or `done`.

| Covering milestones      | Progress      |
| ------------------------ | ------------- |
| done, done               | `done`        |
| done, pending            | `in progress` |
| in progress              | `in progress` |
| pending, pending         | `pending`     |
| none                     | `null`        |
| done, waiting-for-review | `null`        |

Progress reports the state of the work. It is not evidence that the criterion is met, and it grants no approval.

Only valid IDs take part in coverage and progress. When an ID is defined more than once, the first definition counts.

## Error code overlaps

Two distinct active plans overlap when both have status `pending` or `in progress` and claim a shared code in the same repository and exact registry. Compare `String(code)`: numeric `100` and string `"100"` collide, while `"0100"` differs. Duplicate canonical claims within one plan count once. Codes never imply an interval. Each overlap reports `{ repository, registry, code, plans: [{ directory, id }] }`, where code is the canonical string and each directory appears once. Sort by repository, registry, exact lexical code string, then plan directory and ID. Repository output uses lowercase identifiers.

An overlap is advisory. Choosing other codes, or deciding that plans may share a code, stays with their authors and applications.

`jg-plans overlaps` reads the frontmatter of the plans in the folders of the roots the caller names. Unsupported versions, malformed or legacy range declarations, and unreadable frontmatter make the scan incomplete. At most 1024 folders are selected for document reads, with 64 KiB per document. This caps document reads, not directory entries listed or listing memory: complete root listings are sorted before selection. A truncated result is never reported as free of overlaps.

## Diagnostics

Readers retain metadata/framing, YAML, encoding, milestone structure, and overview diagnostics. The following current-protocol rules also apply, including to unversioned plans. Each is an error. Messages describe the issue without quoting document text.

| Code                      | Document           | Reported when                                                               |
| ------------------------- | ------------------ | --------------------------------------------------------------------------- |
| NO_CRITERIA               | plan               | The plan defines no criterion.                                              |
| INVALID_CRITERION_ID      | plan               | A definition's ID is not valid, such as `AC-1` or `AC-001`.                 |
| DUPLICATE_CRITERION       | plan               | An ID is defined more than once; reported at each later definition.         |
| EMPTY_CRITERION           | plan               | A definition has no text.                                                   |
| INVALID_STATUS            | plan or milestones | The plan status or a milestone status is not pending, in progress, or done. |
| INVALID_CRITERIA_MARKER   | milestones         | A coverage line is empty, names an invalid ID, or repeats an ID.            |
| DUPLICATE_CRITERIA_MARKER | milestones         | A milestone has more than one coverage line.                                |
| MISPLACED_CRITERIA_MARKER | milestones         | A coverage line is not directly after the ID line, or the status line.      |
| UNKNOWN_CRITERION         | milestones         | A coverage line names an ID the plan doesn't define.                        |
| UNASSIGNED_CRITERION      | plan               | milestones.md exists and no milestone covers the criterion.                 |
| INVALID_PRIORITY          | plan               | The `priority` field is not `low`, `medium`, `high`, or `hotfix`.           |
| INVALID_REPOSITORIES      | plan               | The `repositories` field is not a nonempty list of unique identifiers.      |
| INVALID_ERROR_CODES       | plan               | The `error_codes` field is not a list of valid entries.                     |
| UNSUPPORTED_PROTOCOL      | plan               | An explicit string protocol version is unsupported.                         |

Each diagnostic points at the line it concerns: the definition, the coverage line, the status field or marker, or the value of the optional field. A check of plan.md alone reports the plan rules. The milestone and coverage rules need both documents. An explicit check fails on any of these errors; inspection reports them without failing.

## Source observations

Optional milestone frontmatter is a project-owned mapping; it does not require the plan's preferred fields. Readers preserve it and exclude it from Markdown heading/marker scanning. Both document kinds retain complete original source, including BOM and line endings. The reference library exposes preamble and heading/body ranges, milestone heading ends, and recognized Overview table ranges so consumers can retain requirements outside numbered milestone bodies.

Exact-byte document hashes and optional structural fingerprints are library observations, not protocol approval fields. Structural fingerprints cover exact body text and raw metadata after explicitly requested top-level exclusions; the generic default excludes nothing. Unavailable structure is reported without discarding useful text or inferring authority. Consumer profiles choose their own policy.

## Revisions, history, and deletion

For substantive agent revisions, recommend a short inline summary explaining actual scope changes and preserving known progress. Do not silently reset completed work to pending.

Recommend a best-effort snapshot before an agent substantively rewrites prose. Snapshot placement and retention belong to the writer/project. Report a snapshot failure without making it a protocol gate.

Readers never depend on a history directory, journal, coordination.json, database, hash ledger, or retained predecessor. Do not manufacture missing evidence or restore deleted documents/history automatically.

Inspection explicitly distinguishes a missing plan, missing milestone file, orphan milestone file, unreadable document, malformed/metadata-free plan, and partly deleted sequence. Absence means absence, not approval or completion. Return useful observations from other readable documents when one cannot be decoded or read.

## Reference mutation boundary

The reference library supports creation, narrow metadata/marker patches, guarded plan-body/metadata replacement, complete milestone-source replacement with explicit missing-ID assignment, and guarded milestone removal. Pure preparation supplies exact output for consumer persistence. It never remaps progress, normalizes unrelated extension fields, maintains a snapshot service, or migrates repositories.

For existing documents, preserve the original bytes outside the exact requested values or inserted field/marker lines, including unknown data, comments, whitespace, BOM, Unicode, CRLF, and final-newline state. Decode UTF-8 strictly and map character positions to original byte spans correctly. Unsupported or ambiguous affected YAML, unsupported encoding, invalid UTF-8, or unencodable replacement text leaves that file unchanged with a specific failure.

A malformed plan must not prevent independent milestone observations or an unambiguous marker edit. Update does not recreate a missing/deleted target. Creation never overwrites an existing destination.

Library and CLI filesystem mutations share short local document locks, acquired in plan-then-milestones order and released in reverse. The public lock callback allows consumers to prepare and persist under that same namespace. Busy/dead owners fail immediately; recovery is an explicit operator decision. Atomic replacement and byte guards detect observed changes, but nonparticipating editors retain a comparison-to-replacement/deletion race. No cross-document transaction, automatic retry, or completion inference is supplied. See the [API](../../api/README.md#shared-document-locks) for lock names and uncertain release outcomes.

## Consumer-owned policy

Approval digests, authorization, execution, allocation services, locks, reconciliation, snapshot retention, and stricter schemas belong to applications. A plan's priority, repositories, and error code declarations are protocol fields, and overlaps are observations; deciding what they allow is still the application's. The core protocol does not make them mandatory. Criteria and coverage give applications a shared vocabulary; deciding whether a criterion is met remains their responsibility.

See [the integration guide](../../docs/integrations.md) and [examples](../../examples/README.md). The library/CLI implement observations and explicit operations; using these tools is optional.
