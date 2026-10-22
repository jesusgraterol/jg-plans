# Consumer integration

Use [protocol 0.1](../protocol/0.1/README.md) as the compact shared format. A project can read Markdown itself or use the reference library/CLI. The [website](https://jg-plans.jesusgraterol.dev) identifies verified package availability. The protocol is usable without installing a tool or calling a website.

## Keep policy with the consumer

Unknown metadata and custom status strings belong to the document's author/project. Keep approvals, digests, authorization, scopes, priorities, allocations, registries, locks, execution and reconciliation in the consuming application. A closed local schema is a stricter consumer profile, not a universal protocol rule.

For example, [the extension example](../examples/extensions/plan.md) contains project.owner and labels. A generic reader preserves them. The example's waiting-for-feedback status does not require every consumer to implement that workflow.

## Document identity and complete requirements

Use exact-byte hashes from `inspectPlan` when comparing a selected document with the bytes observed earlier. Use `fingerprintPlan` or inspection's optional fingerprint for structural identity; explicitly choose excluded metadata keys. The generic library excludes none by default and never interprets a digest as approval.

The planned skills/HQ profile excludes exactly created_at, updated_at, revision, and status while retaining plan id and every unknown contractual field. A caller can use a different policy, but an unavailable fingerprint is not a fresh binding or proof of completion. Keep application approval digests and execution identities separate.

Use the ordered preamble/heading/body source ranges to retain all shared, intervening, and trailing requirements. Milestone bodies deliberately stop at the next level-two heading; requirements under other headings remain in sections rather than disappearing. Optional milestone frontmatter supplies raw project metadata without requiring the plan's fields. Keep byte hashes, source ranges, generic structural fingerprints, and application policy distinct; no second Markdown parser is needed to recover omitted requirements.

## Roots and deletion

Honor an explicit planning root. Otherwise preserve an established coding-agent-planning/ or custom root and use jg-plans/ for a new default. The reference CLI uses explicit paths; root discovery and publication exclusions belong to integrations. Do not move existing plans automatically.

Missing, edited, or deleted documents remain ordinary user choices. Return observations about what exists, preserve known progress, and avoid restoring removed files/history. An optional writer-format checker does not gate inspection or a safe independent edit. Status and metadata never grant execution permission.

## Editing and coordination

Serialize the complete read/edit/write operation for each document, in one process and across processes. The standalone CLI does not coordinate concurrent writers. Atomic replacement and prior-content checks prevent partial output and detect observed conflicts, but retain a comparison-to-rename race.

The reference implementation edits only explicitly requested core metadata or milestone markers, preserves unrelated bytes, and reports unsupported operations. It does not update overview tables or rewrite revision summaries. Missing selected documents are never recreated; inspection/checking does not gate a safe independent edit. Revision and timestamps change only when requested. Use the [API contracts](../api/README.md) and their closed schemas at a programmatic boundary; do not invent a second parser in a CLI wrapper.

The selected directory and ancestors are trusted caller choices. The library rejects links below that root and preserves file permissions on replacement. Unsafe affected YAML/encoding/selector ambiguity leaves the source untouched. The caller must decide how to serialize the complete operation, including same-process calls. A writer that rewrites prose chooses its own best-effort snapshot location/retention; readers never depend on those snapshots.

## Adoption boundary

Adopting this protocol in jg-skills or an HQ project is separately scoped work. Protocol 0.1 stays provisional until jg-skills and at least one HQ consumer have exercised it. Those integrations are not prerequisites for using this project, and no downstream adoption is claimed here.

## Skills: one shared section, distinct responsibilities

Keep installed skills self-contained. Copy the compact writer/reader rules into one identically maintained section stamped **jg-plans protocol 0.1**. During the skills build, compare that section across every generated skill that includes it and fail on drift. Do not make loading or using a skill depend on the website, a network request, or running the jg-plans CLI.

Keep role-specific instructions outside that common section:

- **jg-plan:** write identity, creation/update timestamps, revision, and status; explain the intent and revision summary in Markdown. Revising a plan preserves existing milestones and progress unless the user asks to change or remove them. Avoid creating redundant companion files for a small task.
- **jg-breakdown:** add optional milestones when they help. Place status immediately after the milestone heading; place an optional UUID ID on the next line. Preserve established identities and progress while revising the breakdown. Treat any overview as derived information.
- **jg-execute:** read the selected documents and the user's actual authorization. Existing status markers describe progress; missing metadata, removed files, and checker findings do not create or revoke permission.
- **jg-review and jg-review-session:** assess the relevant work against available evidence and the selected plan. Name missing evidence without inventing history or treating a deleted document as completion. The status line remains authoritative over an overview row.
- **Publication/discovery skills:** recognize both coding-agent-planning/ and jg-plans/, as well as explicitly configured roots. Exclude planning files from broad publication unless the user deliberately includes them. Report a selected planning directory that is not ignored; do not silently change ignore rules or move documents.

For root selection, honor an explicit path first. Otherwise keep the project's configured or established root, including an existing coding-agent-planning/ directory, before introducing jg-plans/ as a new default. When multiple roots are present, resolve the intended scope through the integration's configuration or the user's selection. A root name never grants permission to read unrelated old plans.

Use the CLI only during development to validate documents produced by skill behavior evaluations. Include small plans, custom metadata/statuses, revisions with existing done milestones, edited marker placement, deleted metadata, and deleted companion files. Verify that skills preserve existing progress and obey their role, beyond checking preferred writer conformance. A development evaluation failure is feedback for the skill author; runtime document inspection and user edits remain available.

## HQ consumers: depend on the reference implementation

Use jg-plans for generic parsing and explicit document operations rather than maintaining another interpretation. Preserve a supported public consumer API with the smallest necessary wrapper, or make a documented breaking release when moving to the new dependency changes its contract. Test against that consumer's established documents and public API before migration.

Keep approval digests, authorization, strict project frontmatter, resource schemas, execution, coordination, serialization, and reconciliation inside HQ. A stricter local profile may reject a document for a project-specific action; that does not make the document unreadable under the protocol. Avoid automatic repair, restoration of deleted plans, or silent rewriting to satisfy a closed project schema.
