# Library API

Protocol 0.1 is provisional. These operations describe the implemented reference library. Check the [website's availability label](https://jg-plans.jesusgraterol.dev/docs/api/) before choosing a published package version.

The ESM root exports compiled JavaScript and TypeScript declarations. Node.js 24.15.0 is the runtime floor. Importing jg-plans does not inspect files, log output, or start a process. The only public import path is `jg-plans`.

```ts
import { PROTOCOL_VERSION, parsePlan, parseMilestones, checkPlan, inspectPlan } from 'jg-plans';

const plan = parsePlan('# Useful legacy Markdown');
const milestones = parseMilestones('## Milestone 1: Work\n**Status:** pending');
const check = checkPlan({ plan: plan.source, milestones: milestones.source });
const observation = await inspectPlan('./jg-plans/example', { maxBytes: 1_048_576 });
```

## Parsing and checking

`parsePlan(source)` retains the exact source and body. Its `metadata` contains independently validated core fields. `rawMetadata` retains the expanded YAML value, including unknown fields and invalid known values. Missing metadata, malformed YAML, unsupported expansion, and incompatible values receive structured diagnostics; they do not discard the body or authorize work.

YAML uses maxAliasCount: 100 for expansion protection. Recursive aliases, unsafe integer expansions, and values JSON cannot represent receive a `YAML_VALUE_UNAVAILABLE` warning; rawMetadata is unavailable (`null`) and the original YAML remains in source. Raw observations use YAML's JavaScript conversion; source remains authoritative for original numeric spelling and presentation. Independently readable core fields are still observed. An unterminated frontmatter block retains the complete source as body because its boundary is unknown.

`parseMilestones(source)` returns source, recognizable milestones, optional overview rows, overviewPresent, and diagnostics. overviewPresent distinguishes an absent table from an explicitly empty derived table; an existing table that omits observed milestones receives discrepancies. Each entry contains ordinal, title, observed status/ID or null, location, end offset, body, and all recognized status/ID markers. Duplicate markers remain visible and are diagnosed; the first observed marker supplies the convenience status/ID value. Consumers must consider ambiguity diagnostics before acting on it. Fenced examples are ignored. Missing IDs and overview tables are allowed. Gaps are observations, with no reconstructed entries or inferred completion.

`checkPlan({ plan?, milestones? })` checks explicitly supplied strings against preferred writer conformance. Omit absent or deleted documents. It returns `{ conforms, diagnostics }`; error diagnostics make conforms false. It never writes, restores data, or runs as a prerequisite to another operation.

## Selected-directory inspection

`inspectPlan(directory, { maxBytes? }?)` reads only plan.md and milestones.md from that exact directory, concurrently and with a default 1 MiB limit per file. Explicit custom paths and coding-agent-planning/ work as supplied; there is no repository/root/history discovery.

The result includes the resolved directory, each document's path and readable/missing/unreadable state, useful parsed data for readable files, and aggregated diagnostics. A readable empty file differs from a missing file. Orphan milestones remain observable when the plan has been deleted. No predecessor is required or restored.

Bytes must decode strictly as UTF-8. An existing BOM is retained in source. Invalid bytes receive INVALID_ENCODING, and another readable document still contributes observations. File-size failures and nonregular/unreadable targets receive operational diagnostics. Final-component file symlinks are not followed; the selected directory's ancestors are caller-chosen. The library does not silently transcode content.

## Types and schemas

Creation and update contracts are described below. A [runnable library example](../examples/library.mjs) exercises creation, sequential updates, inspection, and checking in an owned temporary directory.

Named public types are IPlanMetadata, IDiagnostic, ISourceLocation, IReadOptions, IPlanDocuments, IParsedPlan, IFrontmatter, IMarker, IMilestone, IOverviewRow, IParsedMilestones, ICheckResult, IDocumentRead, IPlanInspection, ICreatePlanOptions, IPlanCreation, IPlanUpdate, and IPlanUpdateResult.

PlanMetadataSchema defines preferred complete metadata and allows project extensions. DiagnosticSchema, SourceLocationSchema, ReadOptionsSchema, and PlanDocumentsSchema own the corresponding boundary contracts. Known fields are validated independently during tolerant reads. PROTOCOL_VERSION is `0.1`; it is independent of the npm package version.

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

The result contains directory, parsed plan, parsed milestones or null, and diagnostics. Existing destinations fail without overwriting. Failed creation attempts remove only recognized files created by that call and the empty owned plan directory. Intervening user content is preserved; incomplete cleanup is reported in error.data.cleanupFailedPaths. An empty selected storage root can remain after failure.

## Targeted updates

`updatePlan(directory, patch, { maxBytes? }?)` edits one existing document and returns `{ directory, document, changed, diagnostics }`. The closed PlanUpdateSchema accepts either:

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

Unsupported edits fail without writing. These include malformed/unterminated frontmatter, a flow-style root mapping, complex/anchored/tagged root keys, merge keys, duplicate affected keys, and affected aliases, anchors, tags, block/multiline scalars, or implicit empty nulls. Duplicate/missing milestone selectors, repeated targets, duplicate affected markers, and overlapping spans also fail. Unrelated nonconforming fields are not a conformance gate. error.data.reason identifies the unsupported case, with field when relevant; it contains no source snippet. This is a conservative scalar/marker editor, with no general YAML or Markdown rewrite API.

Bytes must be valid UTF-8, and replacement strings cannot contain unpaired UTF-16 surrogates. The caller-selected directory and its ancestors are trusted path choices; links below that root are rejected. Replacement preserves file permissions. **Serialize the entire read/edit/write operation for a document, including within one process.** The prior-content comparison detects observed intervening changes, but a comparison-to-rename race remains. No lock, queue, journal, snapshot service, or automatic retry is provided.

CreatePlanOptionsSchema and PlanUpdateSchema are public boundary schemas; PlanSetSchema, MilestoneSelectorSchema, and MilestoneSetSchema expose their constituent contracts. New metadata is JSON-compatible; original YAML source remains authoritative on reads.

## Failures

Invalid operation arguments throw JG_PLANS_INVALID_INPUT: Invalid jg-plans input. File absence, formatting defects, encoding failures, and read failures are returned as inspection diagnostics. Mutations throw operational errors for unsupported text/edits, existing destinations, detected source changes, and read/write failures. See the [error reference](../errors/README.md) for exact codes/messages and per-operation mapping. ERRORS exposes the stable operational codes.

Approval, authorization, stricter profiles, coordination, retention, and execution remain consumer-owned. See the [protocol](../protocol/0.1/README.md) and [integration guide](../docs/integrations.md).
