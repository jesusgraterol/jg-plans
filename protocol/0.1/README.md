# jg-plans protocol 0.1

**Status:** provisional draft

A compact Markdown protocol for plans and optional milestones. People own their files and can edit, move, shorten, or delete them. The protocol describes documents and observations; projects decide how to approve and execute work.

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

The reference CLI's --root default is ./jg-plans relative to the invocation directory. It uses explicit paths and does not discover a repository's established root on its own.

The reference implementation supports UTF-8 Markdown, with an optional UTF-8 BOM. Invalid UTF-8 and unsupported encodings produce diagnostics. They are not silently transcoded. This implementation boundary does not require every protocol consumer to share the same file-size limit.

## Plan metadata

A newly generated preferred plan starts with YAML frontmatter containing:

| Field      | Writer value           | Meaning                                     |
| ---------- | ---------------------- | ------------------------------------------- |
| id         | Nonempty stable string | Document identity independent of its path.  |
| created_at | RFC 3339 timestamp     | Known creation time.                        |
| updated_at | RFC 3339 timestamp     | The author's latest recorded revision time. |
| revision   | Positive integer       | Author-maintained document revision.        |
| status     | Nonempty string        | Project-defined document state.             |

Default ID generation uses Unix seconds plus a descriptive slug. Readers do not require that pattern, a UUID, or a project-specific identifier length. Preferred examples use pending, in progress, and done; other status values remain valid strings.

```markdown
---
id: 1792612800_search-feedback
created_at: 2026-10-21T20:00:00Z
updated_at: 2026-10-21T20:00:00Z
revision: 1
status: pending
---

# Search feedback

Explain empty search results and give people a useful next action.
```

Do not invent an unknown historical creation time. A revision is not a digest, approval token, or execution permission. The reference library changes revision and timestamp fields only when callers explicitly request those edits.

Read raw metadata independently from known-field validation. Preserve unknown keys and their source, and retain invalid known values as raw observations alongside diagnostics. Additional authorship, repository references, approval records, and other fields are consumer-owned extensions. Consumers may implement stricter local profiles if they identify that strictness as project policy.

Protocol 0.1 is independent of npm version 0.1.0. A consumer may add an optional protocol-version extension; readers do not require a version field to read an existing document.

## Plan body

Keep the body ordinary Markdown. Use the context a task needs: objective, scope, decisions, approach, validation, risks, and acceptance criteria. Small plans can be short. No fixed heading inventory is required.

Do not infer that a plan was approved from a status, revision, directory, timestamp, or missing text. Approval and execution remain application/workflow concerns.

## Optional milestones

A plan does not need milestones. When reviewable units are useful, put them in milestones.md:

```markdown
## Milestone 1: Explain empty search results

**Status:** pending
**Milestone ID:** 5a148c73-7d38-4a2f-9c0f-903d93b9b764

Describe the work, evidence, acceptance criteria, and review checkpoint.
```

Preferred writers use positive numbered headings in document order. The status marker is the first nonblank line after its heading. An optional milestone ID marker is the immediately following line after status, without a blank line between the two markers. New marker insertion uses that placement.

The status marker is the authoritative progress observation. A stable UUID milestone ID is recommended when identity across revisions matters; it is optional. Readers retain unrecognized status and ID text and diagnose incompatible values instead of discarding the entry.

Ignore headings and marker-like text inside fenced code. Diagnose duplicate ordinals, duplicate IDs, missing status lines, misplaced markers, and ambiguous structures while retaining unrelated readable entries. Gaps or partly deleted sequences do not recreate deleted milestones or establish completion.

An optional Overview table with Milestone, Name, and Status columns is derived from marker observations. Readers may diagnose discrepancies. They neither require the table nor rewrite it implicitly.

Caller-supplied milestone source remains verbatim. A caller generating that source follows writer rules; nonconforming supplied source receives diagnostics rather than automatic normalization. Updating a recognizable misplaced marker may preserve its location with a diagnostic; it does not claim to have repaired conformance.

## Source observations

Optional milestone frontmatter is a project-owned mapping; it does not require the plan's five preferred fields. Readers preserve it and exclude it from Markdown heading/marker scanning. Both document kinds retain complete original source, including BOM and line endings. The reference library exposes preamble and heading/body ranges, milestone heading ends, and recognized Overview table ranges so consumers can retain requirements outside numbered milestone bodies.

Exact-byte document hashes and optional structural fingerprints are library observations, not protocol approval fields. Structural fingerprints cover exact body text and raw metadata after explicitly requested top-level exclusions; the generic default excludes nothing. Unavailable structure is reported without discarding useful text or inferring authority. Consumer profiles choose their own policy.

## Revisions, history, and deletion

For substantive agent revisions, recommend a short inline summary explaining actual scope changes and preserving known progress. Do not silently reset completed work to pending.

Recommend a best-effort snapshot before an agent substantively rewrites prose. Snapshot placement and retention belong to the writer/project. Report a snapshot failure without making it a protocol gate.

Readers never depend on a history directory, journal, coordination.json, database, hash ledger, or retained predecessor. Do not manufacture missing evidence or restore deleted documents/history automatically.

Inspection explicitly distinguishes a missing plan, missing milestone file, orphan milestone file, unreadable document, malformed/metadata-free plan, and partly deleted sequence. Absence means absence, not approval or completion. Return useful observations from other readable documents when one cannot be decoded or read.

## Reference mutation boundary

The first reference library supports creation and targeted edits to core metadata and milestone status/ID markers. It does not rewrite general Markdown, normalize extension fields, reorder milestones, remap progress, maintain a snapshot service, or migrate repositories.

For existing documents, preserve the original bytes outside the exact requested values or inserted field/marker lines, including unknown data, comments, whitespace, BOM, Unicode, CRLF, and final-newline state. Decode UTF-8 strictly and map character positions to original byte spans correctly. Unsupported or ambiguous affected YAML, unsupported encoding, invalid UTF-8, or unencodable replacement text leaves that file unchanged with a specific failure.

A malformed plan must not prevent independent milestone observations or an unambiguous marker edit. Update does not recreate a missing/deleted target. Creation never overwrites an existing destination.

Consumers serialize the whole read/edit/write operation for each document, including concurrent calls in one process and across processes. The standalone CLI provides no cross-process coordination: run its updates to the same document sequentially. Atomic replacement prevents partial-file output; a prior-content check detects observed changes but has a comparison-to-rename race. Do not claim protection against every writer or silently retry over newer contents.

## Consumer-owned policy

Approval digests, authorization, execution, repositories and scopes, priorities, resource/error allocations, locks, reconciliation, snapshot retention, and stricter schemas belong to applications. The core protocol does not make them mandatory.

See [the integration guide](../../docs/integrations.md) and [examples](../../examples/README.md). The library/CLI implement observations and explicit operations; using these tools is optional.
