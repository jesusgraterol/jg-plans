# Library API

Protocol 0.1 is provisional. These operations describe the implemented reference library. Check the [website's availability label](https://jg-plans.jesusgraterol.dev/docs/api/) before choosing a published package version.

The ESM root exports compiled JavaScript and TypeScript declarations. Node.js 24.15.0 is the runtime floor. Importing jg-plans does not inspect files, log output, or start a process. The only public import path is `jg-plans`.

```ts
import { PROTOCOL_VERSION, parsePlan, parseMilestones, checkPlan, inspectPlan } from 'jg-plans';

const plan = parsePlan('# Useful Markdown');
const milestones = parseMilestones('## Milestone 1: Work\n**Status:** pending');
const check = checkPlan({ plan: plan.source, milestones: milestones.source });
const observation = await inspectPlan('./jg-plans/example', { maxBytes: 1_048_576 });
```

## Parsing and checking

`parsePlan(source)` retains the exact source and body. Its `metadata` contains independently validated core fields. `rawMetadata` retains the expanded YAML value, including unknown fields and invalid known values. Missing metadata, malformed YAML, unsupported expansion, and incompatible values receive structured diagnostics; they do not discard the body or authorize work.

YAML uses maxAliasCount: 100 for expansion protection. Recursive aliases, unsafe integer expansions, non-string or ambiguous YAML mapping keys, and values JSON cannot represent receive a `YAML_VALUE_UNAVAILABLE` warning; rawMetadata is unavailable (`null`) and the original YAML remains in source. Raw observations use YAML's JavaScript conversion; source remains authoritative for original numeric spelling and presentation. Independently readable core fields are still observed. An unterminated frontmatter block retains the complete source as body because its boundary is unknown.

`parseMilestones(source)` returns source, recognizable milestones, optional overview rows, overviewPresent, and diagnostics. overviewPresent distinguishes an absent table from an explicitly empty derived table; an existing table that omits observed milestones receives discrepancies. Each entry contains ordinal, title, observed status/ID or null, location, end offset, body, and all recognized status/ID markers. Duplicate markers remain visible and are diagnosed; the first observed marker supplies the convenience status/ID value. Consumers must consider ambiguity diagnostics before acting on it. Fenced examples are ignored. Missing IDs and overview tables are allowed. Gaps are observations, with no reconstructed entries or inferred completion.

`checkPlan({ plan?, milestones? })` checks explicitly supplied strings against preferred writer conformance. Omit absent or deleted documents. It returns `{ conforms, diagnostics }`; error diagnostics make conforms false. It never writes, restores data, or runs as a prerequisite to another operation.

## Source ranges and milestone metadata

Both parsers return a `preamble` span and ordered `sections` for every unfenced level-two heading. Each section has its observed title, a `heading` span including its line ending, and a `body` span extending to the next level-two heading or EOF. `ISourceSpan` has zero-based UTF-16 `start` and exclusive `end`; slice the returned original source with those offsets.

The preamble starts at zero and includes everything before the first observed section, including any BOM, frontmatter, title, and introductory prose. Concatenating the preamble and every heading/body span reproduces the complete original source. Sections keep shared, intervening, and trailing requirements visible even when they are not milestone entries. A milestone's `headingEnd` is the first offset after its heading line; its existing `end` and `body` still stop at the next level-two heading.

Milestones may begin with an optional frontmatter mapping. `frontmatter`, `rawMetadata`, and exact `body` are observed through the same YAML reader as plans, without requiring the five plan fields. Frontmatter is excluded from heading and marker scanning; Markdown-looking YAML never becomes work. Unterminated frontmatter remains ambiguous and retains the whole source as body. `overviewTables` contains only recognized table spans, from header through separator and consecutive rows; adjacent prose and fenced examples are excluded.

## Structural fingerprints

```ts
import { fingerprintPlan, inspectPlan } from 'jg-plans';

const exclusions = ['created_at', 'updated_at', 'revision', 'status'];
const fingerprint = fingerprintPlan('# Work', { excludeMetadataKeys: exclusions });
const inspection = await inspectPlan('./jg-plans/example', {
  fingerprint: { excludeMetadataKeys: exclusions },
});
```

`fingerprintPlan(source, options?)` returns `{ sha256, excludeMetadataKeys, diagnostics }`. It hashes strict deterministic JSON of `{ body, metadata }`, where body is exact parsed body text and metadata is raw top-level metadata after removing only explicitly named keys. The default exclusion list is empty; duplicate requested keys are reported once, in first-occurrence order. There are no implicit administrative exclusions. Unknown metadata, plan identity, nested values, and key/value distinctions remain covered. Nested fields with an excluded key name remain covered.

Metadata key order, YAML quoting, and YAML comments alone do not change this structural digest. Exact body text, including its whitespace and line endings, does. Metadata-free source uses an empty mapping and remains fingerprintable without preferred-field conformance. Unterminated or ambiguous framing, invalid YAML, nonmapping frontmatter, unresolved YAML warnings, or unavailable/non-JSON-safe values return `sha256: null` with safe diagnostics while ordinary inspection remains useful. The implementation uses `jg-utilities` strict deterministic serialization and `jg-crypto` SHA-256.

A structural fingerprint is distinct from an exact file hash and from an application's approval digest. Consumers choose exclusion policy and decide freshness, authorization, and scope coverage. It never grants approval or completion.

## Selected-directory inspection

`inspectPlan(directory, { maxBytes?, fingerprint? }?)` reads only plan.md and milestones.md from that exact directory, concurrently and with a default 1 MiB limit per file. Explicit custom paths and coding-agent-planning/ work as supplied; there is no repository/root/history discovery.

The result includes the resolved directory, each document's path and readable/missing/unreadable state, useful parsed data for readable files, and aggregated diagnostics. Every readable document also has lowercase `sha256` computed from the exact original bytes, including BOM and line endings. A readable empty file differs from a missing file. Orphan milestones remain observable when the plan has been deleted. No predecessor is required or restored.

Supplying `fingerprint: { excludeMetadataKeys? }` adds a top-level `fingerprint` result, reusing the already-read and parsed plan. Missing/unreadable plans return an unavailable requested fingerprint rather than fabricated content. Omitting the option omits that result.

Bytes must decode strictly as UTF-8. An existing BOM is retained in source. Invalid bytes receive INVALID_ENCODING, and another readable document still contributes observations. File-size failures and nonregular/unreadable targets receive operational diagnostics. Final-component file symlinks are not followed; the selected directory's ancestors are caller-chosen. The library does not silently transcode content.

## Types and schemas

Creation, preparation, updates, guarded writes, removal, and locks are described below. A [runnable library example](../examples/library.mjs) exercises creation, sequential updates, inspection, and checking in an owned temporary directory.

Named public types are IPlanMetadata, IDiagnostic, ISourceLocation, ISourceSpan, IHeadingSection, IReadOptions, IPlanFingerprintOptions, IInspectPlanOptions, IPlanFingerprint, IPlanDocuments, IParsedPlan, IFrontmatter, IMarker, IMilestone, IOverviewRow, IParsedMilestones, ICheckResult, IDocumentRead, IPlanInspection, ICreatePlanOptions, IPlanCreation, IPlanUpdate, IPlanUpdateResult, IPlanDocumentWrite, IPlanDocumentWriteResult, IRemoveMilestones, IRemoveMilestonesResult, IPreparedPlanEdit, and IAssignedMilestoneId.

PlanMetadataSchema defines preferred complete metadata and allows project extensions. DiagnosticSchema, SourceLocationSchema, ReadOptionsSchema, PlanFingerprintOptionsSchema, PlanFingerprintSchema, InspectPlanOptionsSchema, and PlanDocumentsSchema own the corresponding boundary contracts. Fingerprint results and inspection/fingerprint options are closed schemas; only explicit supported keys are accepted. Known metadata fields are validated independently during tolerant reads. PROTOCOL_VERSION is `0.1`; it is independent of the npm package version.

Source offsets count JavaScript UTF-16 code units. Lines and columns start at one. Marker value spans exclude surrounding whitespace and line endings. Entries and overview rows retain ordinalText; ordinal is null for nonpositive or unsafe integer text, avoiding rounded identities. These are observations, not general-purpose rewrite permission.

## Exclusive creation

```ts
import { createPlan, updatePlan } from 'jg-plans';

const created = await createPlan({
  root: './jg-plans', // optional; resolved from the current working directory
  slug: 'small-change',
  body: '# Intent\n\nKeep this prose.\n',
  metadata: { project: { owner: 'example' } },
  milestones: '## Milestone 1: Implement\n**Status:** pending\n', // optional, verbatim
});
await updatePlan(created.directory, { document: 'plan', set: { revision: 2 } });
```

`createPlan(options)` creates `<unix-seconds>_<slug>/plan.md` exclusively beneath the supplied root, or ./jg-plans. It never discovers or migrates an existing root. Slugs use lowercase ASCII kebab case; the generated directory component must fit 64 characters. The generated relative file paths fit 160 characters. A supplied document ID is opaque and never becomes a path.

The closed CreatePlanOptionsSchema accepts slug, optional root, body, optional JSON metadata, and optional milestones text. Missing core metadata defaults to the generated name as id, one captured ISO creation time for created_at and updated_at, revision 1, and pending status. Supplied values override defaults, including nonconforming known values; diagnostics describe them without refusing to preserve them. Unknown project metadata is retained. The supplied Markdown body and milestone bytes are preserved; creation emits new UTF-8 frontmatter with LF separators.

The result contains directory, parsed plan with its exact-byte sha256, parsed milestones with sha256 or null, and diagnostics. Existing destinations fail without overwriting. Failed creation attempts remove only recognized files created by that call and the empty owned plan directory. Intervening user content is preserved; incomplete cleanup is reported in error.data.cleanupFailedPaths. An empty selected storage root can remain after failure.

## Targeted updates

`updatePlan(directory, patch, { maxBytes? }?)` edits one existing document and returns `{ directory, document, changed, sha256, diagnostics, assignedMilestoneIds }`. The closed PlanUpdateSchema accepts either variant below, with optional expectedSha256 on either variant. Supply a freshly observed lowercase SHA-256 to reject stale or deleted sources before preparation:

```json
{ "document": "plan", "set": { "status": "in progress", "revision": 2 } }
```

```json
{
  "document": "milestones",
  "changes": [{ "select": { "ordinal": 1 }, "set": { "status": "done" } }]
}
```

PlanSetSchema allows only id, created_at, updated_at, revision, and status, validated by their preferred core schemas. Supply at least one field. Revision and updated_at change only when explicitly requested. MilestoneSelectorSchema selects one entry by UUID id or positive safe ordinal, never both. MilestoneSetSchema allows status and/or UUID id. Status must be nonblank, trimmed, and contain no CR/LF. Each target occurs at most once per call; combine its changes in one set.

The update reads only the selected document, bounded at 1 MiB by default. A malformed or deleted companion document does not block an independent edit. Missing targets are never recreated. Insertions require an unambiguous location: absent plan fields go before the closing frontmatter delimiter; metadata-free Markdown receives frontmatter containing only requested fields. New status markers go immediately after their heading, and new IDs immediately after an unambiguous canonical status line. Existing misplaced markers are updated in place and remain diagnosed; the overview table and prose are not changed.

Every byte outside the requested value spans or insertion points is preserved, including BOM, supplementary Unicode, unrelated nested metadata, comments, quotes, whitespace, line endings, and final-newline state. Equal values produce a no-op and skip replacement. Existing single quotes are retained when their style can represent the value; replacements otherwise use quoted YAML scalars.

Unsupported edits fail without writing. These include malformed/unterminated frontmatter, a flow-style root mapping, complex/anchored/tagged root keys, merge keys, duplicate affected keys, and affected aliases, anchors, tags, block/multiline scalars, or implicit empty nulls. Duplicate/missing milestone selectors, repeated targets, duplicate affected markers, and overlapping spans also fail. Unrelated nonconforming fields are not a conformance gate. error.data.reason identifies the unsupported case, with field when relevant; it contains no source snippet. This narrow operation is a conservative scalar/marker editor; use explicit document writes below for body or milestone-source replacement.

Bytes must be valid UTF-8, and replacement strings cannot contain unpaired UTF-16 surrogates. The caller-selected directory and its ancestors are trusted path choices; links below that root are rejected. Replacement preserves file permissions. All filesystem mutations acquire the shared selected-document lock before reading or preparing. The prior-content comparison detects observed intervening changes, but nonparticipating editors retain a comparison-to-rename race. No journal, snapshot service, or automatic retry is provided.

CreatePlanOptionsSchema and PlanUpdateSchema are public boundary schemas; PlanSetSchema, MilestoneSelectorSchema, and MilestoneSetSchema expose their constituent contracts. New metadata is JSON-compatible; original YAML source remains authoritative on reads.

## Pure preparation and guarded document writes

`preparePlanUpdate(source, patch)` applies the same narrow edit entirely in memory. `preparePlanDocumentWrite(source, input)` prepares the explicit replacement below. Both return `{ source, changed, sha256, diagnostics, assignedMilestoneIds }` (IPreparedPlanEdit). They perform no filesystem access, locks, timestamps, revision increments, or implicit ID assignment. Persist the exact prepared source once in a consumer journal; do not regenerate random IDs during replay. IAssignedMilestoneId contains ordinal and id.

`writePlanDocument(directory, input, { maxBytes? }?)` reads only the selected document, validates its required expectedSha256 before preparation, and persists the prepared output under its shared lock. PlanDocumentWriteSchema is closed and discriminated by document:

```ts
import { inspectPlan, writePlanDocument } from 'jg-plans';
const observed = await inspectPlan('./jg-plans/example');
if (observed.plan.state === 'readable') {
  await writePlanDocument(observed.directory, {
    document: 'plan',
    expectedSha256: observed.plan.sha256,
    body: '# Revised intent\n',
    set: { revision: 2 },
  });
}
```

The plan variant requires an existing digest, a replacement body, and optional core metadata set. Body and supplied metadata are changed together, preserving all unaffected frontmatter bytes. Closed malformed YAML permits body-only replacement; ambiguous/unterminated boundaries fail. A needed line separator is inserted after a closing delimiter at EOF. The existing BOM encoding marker is preserved; on metadata-free source, a leading BOM also present in the supplied body is treated as that same marker. A body-only operation cannot introduce frontmatter into metadata-free source. Replacement strings must encode strictly as UTF-8.

The milestones variant accepts `{ document: 'milestones', expectedSha256: string | null, source: string, assignMissingIds?: boolean }`. Null requires an absent file and uses exclusive creation; a digest never recreates deleted files. Source is verbatim unless explicit assignMissingIds is true. That option preserves valid IDs and inserts random UUIDs immediately after unique canonical nonempty status lines. Duplicate/invalid identities, ordinals, or ambiguous insertion targets fail. It returns assigned ordinal/id pairs; without the option, missing IDs remain missing. No timestamps, completion, or approvals are inferred.

Pure preparation accepts null original source only for explicit absent milestone creation. Existing-source expectations are checked against strict UTF-8 bytes. Filesystem guards compare the original bytes before decoding. Writes return `{ directory, document, changed, sha256, diagnostics, assignedMilestoneIds }`; a no-op still checks its expectation and skips replacement. Existing permissions are preserved. maxBytes bounds reads rather than the size of the prepared output.

`removeMilestones(directory, { expectedSha256 }, { maxBytes? }?)` (RemoveMilestonesSchema) removes only an existing regular UTF-8 milestones.md matching that digest. Missing or changed targets fail SOURCE_CHANGED. The result is `{ directory, document: 'milestones', changed: true, sha256: null, diagnostics: [] }`. The plan, selected directory, coordination files, and history are untouched. Links, nonregular targets, unreadable/oversized source, and unsupported encoding fail. Nonparticipating editors retain a check-to-unlink race.

## Shared document locks

`withPlanDocumentLocks(directory, documents, operation)` accepts a nonempty unique selection of plan/milestones and calls operation with the canonical real directory. It acquires `.plan.md.jg-plans.lock` before `.milestones.md.jg-plans.lock` regardless of input order, then releases in reverse order. Every filesystem mutation, including initial creation, uses this namespace. Failed creation releases locks before owned empty-directory cleanup.

Use pure preparation and consumer persistence inside a callback; nesting filesystem mutations reacquires the held lock and fails busy. Keep callbacks bounded to one operation, never across model/agent turns. Locks use jg-fs ownership checks, support local filesystems, and fail immediately for busy or dead owners. There is no TTL, polling, or automatic takeover. After a crash, inspect the owner and affected documents before explicit operator recovery through jg-fs; never remove an unfamiliar lock.

LOCK_BUSY and acquisition LOCK_FAILED report phase/document/reason and mutationOutcome not-applied. Release LOCK_FAILED reports operationCompleted and mutationOutcome uncertain when the callback started, even if all writes landed; inspect/reconcile durable state before retrying. Callback and release failures are retained in its internal AggregateError cause. These locks coordinate participants, not every editor. They provide neither a cross-document transaction nor an HQ journal.

## Failures

Invalid operation arguments throw JG_PLANS_INVALID_INPUT: Invalid jg-plans input. File absence, formatting defects, encoding failures, and read failures are returned as inspection diagnostics. Mutations throw operational errors for unsupported text/edits, existing destinations, detected source changes, and read/write failures. See the [error reference](../errors/README.md) for exact codes/messages and per-operation mapping. ERRORS exposes the stable operational codes.

Approval, authorization, stricter profiles, coordination, retention, and execution remain consumer-owned. See the [protocol](../protocol/0.1/README.md) and [integration guide](../docs/integrations.md).
