# Consumer integrations

Protocol 0.2 provides ordinary documents and deterministic operations. Consumers decide scope, authority, approval, progress semantics, retention, and reconciliation. A hash or checker result grants no permission.

Applications that show plans read acceptance criteria, their covering milestones, and their progress through `observeCriteria` or the `criteria` observation of inspect, instead of parsing Markdown themselves. The shipped criteria examples state their expected results in expected.json, so an integration can test that it reads them the same way.

## Skills: explicit runtime and freshness policy

Persisted planning workflows use the separately installed supported CLI, with explicit selected paths and structured JSON. Preflight the package version and envelope; never install it automatically. This 0.5.0 implementation reports CLI schema 2, with explicit string/number code lists, canonical String(code) overlaps, and a derived top-level name. External skills temporarily support the earlier 0.4.x/schema-1 profile as a separate migration step; that does not make the old contract supported by this package. New skill plans use jg-plans/; an explicitly supplied custom path remains valid. Readers do not discover old roots or reconstruct deleted documents. The one read beyond the selected folder is `overlaps`, over the planning roots the caller names.

Keep one identical compact **jg-plans protocol 0.2** section in the seven planning reader/writer skills. Role-specific rules stay outside it. jg-plan owns substantive revisions and explicit updated_at/revision changes; jg-breakdown owns semantic coverage and sequence binding; jg-execute owns authorized work and progress. Reviews/challenges remain read-only. No missing/custom status is coerced into permission or completion.

Inspect before each mutation and supply the observed expectedSha256. Use write for plan-body/core-metadata changes or complete milestone source, update for narrow markers/core fields, and authorized guarded removal for an unnecessary sequence. Request missing UUIDs explicitly. Preserve existing identities and valid completion evidence; tools do not infer correspondence.

The skills bind a milestone sequence to plan id, revision, and structural content fingerprint, excluding exactly created_at, updated_at, revision, status, and priority from that fingerprint. Other metadata and exact body remain covered. Revalidate coverage after revisions before stamping a fresh binding. A stale/unavailable binding cannot authorize sequence execution. Whole-plan execution without an expected sequence stays a supported single unit; disappearance of an expected sequence is a loss to report.

## Applications: one engine, application-owned policy

An application that tracks plans across repositories uses public jg-plans observations instead of another Markdown grammar. It reads status, priority, repositories, and error code declarations from each plan's frontmatter, and reports collisions with `findErrorCodeOverlaps` over the active plans of every repository it knows. These are observations: how the application queues plans, locks work, or reconciles state stays its own policy, never fields the protocol requires.

A writer that edits plan documents prepares once and persists the exact resulting source. Inside withPlanDocumentLocks, use pure preparation and its own persistence; do not nest filesystem mutation entry points.

## Coordinating participating writers

The CLI and every filesystem mutation share canonical local document lock names with the public callback. Locks cover one bounded read/prepare/persist operation, never model turns. Fixed order is plan then milestones; release is reverse. Dead owners remain busy until explicit operator inspection/recovery. The library never takes over automatically or removes an unfamiliar lock.

File hashes guard exact bytes; structural fingerprints cover caller-selected content; approval digests are application policy. Preserve this distinction. There is no cross-document transaction and nonparticipating editors retain the documented comparison-to-replacement/deletion race. Partial outcomes must be reported honestly rather than rolled back over newer content.

See the [API](../api/README.md), [CLI](../cli/README.md), and [errors](../errors/README.md) for exact contracts. Protocol conformance is optional during inspection; stricter application admission remains consumer-owned. Priority, repositories, and error code declarations are protocol fields; approvals, allocation services, locks, and reconciliation stay with applications.
