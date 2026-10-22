# Consumer integration

Use [protocol 0.1](../protocol/0.1/README.md) as the compact shared format. A project can read Markdown itself or use the implemented reference library/CLI; public npm availability is not yet verified. The protocol is usable without installing a tool or calling a website.

## Keep policy with the consumer

Unknown metadata and custom status strings belong to the document's author/project. Keep approvals, digests, authorization, scopes, priorities, allocations, registries, locks, execution and reconciliation in the consuming application. A closed local schema is a stricter consumer profile, not a universal protocol rule.

For example, [the extension example](../examples/extensions/plan.md) contains project.owner and labels. A generic reader preserves them. The example's waiting-for-feedback status does not require every consumer to implement that workflow.

## Roots and deletion

Honor an explicit planning root. Otherwise preserve an established coding-agent-planning/ or custom root and use jg-plans/ for a new default. The reference CLI uses explicit paths; root discovery and publication exclusions belong to integrations. Do not move existing plans automatically.

Missing, edited, or deleted documents remain ordinary user choices. Return observations about what exists, preserve known progress, and avoid restoring removed files/history. An optional writer-format checker does not gate inspection or a safe independent edit. Status and metadata never grant execution permission.

## Editing and coordination

Serialize the complete read/edit/write operation for each document, in one process and across processes. The standalone CLI does not coordinate concurrent writers. Atomic replacement and prior-content checks prevent partial output and detect observed conflicts, but retain a comparison-to-rename race.

The reference implementation edits only explicitly requested core metadata or milestone markers, preserves unrelated bytes, and reports unsupported operations. It does not update overview tables or rewrite revision summaries. Missing selected documents are never recreated; inspection/checking does not gate a safe independent edit. Revision and timestamps change only when requested. Use the [API contracts](../api/README.md) and their closed schemas at a programmatic boundary; do not invent a second parser in a CLI wrapper.

The selected directory and ancestors are trusted caller choices. The library rejects links below that root and preserves file permissions on replacement. Unsafe affected YAML/encoding/selector ambiguity leaves the source untouched. The caller must decide how to serialize the complete operation, including same-process calls. A writer that rewrites prose chooses its own best-effort snapshot location/retention; readers never depend on those snapshots.

## Adoption boundary

Adopting this protocol in jg-skills or an HQ project is separately scoped work. Existing progress and supported public consumer contracts need evidence before migration. Integration recipes and the final development-time conformance guidance are completed alongside the tested reference package and website; no downstream adoption is claimed here.
