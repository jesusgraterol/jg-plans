# Consumer integrations

Protocol 0.1 provides ordinary documents and deterministic operations. Consumers decide scope, authority, approval, progress semantics, retention, and reconciliation. A hash or checker result grants no permission.

## Skills: explicit runtime and freshness policy

Persisted planning workflows use the separately installed supported CLI, with explicit selected paths and structured JSON. Preflight the package version and envelope; never install it automatically. New skill plans use jg-plans/; an explicitly supplied custom path remains valid. Readers do not discover old roots or reconstruct deleted documents.

Keep one identical compact **jg-plans protocol 0.1** section in the seven planning reader/writer skills. Role-specific rules stay outside it. jg-plan owns substantive revisions and explicit updated_at/revision changes; jg-breakdown owns semantic coverage and sequence binding; jg-execute owns authorized work and progress. Reviews/challenges remain read-only. No missing/custom status is coerced into permission or completion.

Inspect before each mutation and supply the observed expectedSha256. Use write for plan-body/core-metadata changes or complete milestone source, update for narrow markers/core fields, and authorized guarded removal for an unnecessary sequence. Request missing UUIDs explicitly. Preserve existing identities and valid completion evidence; tools do not infer correspondence.

The skills bind a milestone sequence to plan id, revision, and structural content fingerprint, excluding exactly created_at, updated_at, revision, and status from that fingerprint. Other metadata and exact body remain covered. Revalidate coverage after revisions before stamping a fresh binding. A stale/unavailable binding cannot authorize sequence execution. Whole-plan execution without an expected sequence stays a supported single unit; disappearance of an expected sequence is a loss to report.

## HQ: one engine, application-owned authority

Use public jg-plans observations/ranges, fingerprints, and pure preparation instead of another Markdown grammar. Retain HQ's strict project profile, host parser hook, approval digests, execution gates, limits, resource/error allocations, coordination journal, and reconciliation. Unknown contractual metadata and shared/trailing requirements must remain part of execution identity.

For journaled writes, prepare once and persist the exact resulting source, generated IDs, and timestamps before applying it. Acquire HQ metadata ownership before shared document locks. Inside withPlanDocumentLocks, use pure preparation and HQ persistence; do not nest filesystem mutation entry points. Release shared locks successfully before completing the HQ ledger. Release failures can follow durable writes and require reconciliation with admission closed.

## Coordinating participating writers

The CLI and every filesystem mutation share canonical local document lock names with the public callback. Locks cover one bounded read/prepare/persist operation, never model turns. Fixed order is plan then milestones; release is reverse. Dead owners remain busy until explicit operator inspection/recovery. The library never takes over automatically or removes an unfamiliar lock.

File hashes guard exact bytes; structural fingerprints cover caller-selected content; approval digests are application policy. Preserve this distinction. There is no cross-document transaction and nonparticipating editors retain the documented comparison-to-replacement/deletion race. Partial outcomes must be reported honestly rather than rolled back over newer content.

See the [API](../api/README.md), [CLI](../cli/README.md), and [errors](../errors/README.md) for exact contracts. Protocol conformance is optional during inspection; stricter application admission remains consumer-owned.
