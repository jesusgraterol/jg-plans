# Library API

**Development preview.** Protocol 0.1 is provisional. These operations describe the implemented read-only library; npm availability has not been verified.

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

Named public types are IPlanMetadata, IDiagnostic, ISourceLocation, IReadOptions, IPlanDocuments, IParsedPlan, IFrontmatter, IMarker, IMilestone, IOverviewRow, IParsedMilestones, ICheckResult, IDocumentRead, and IPlanInspection.

PlanMetadataSchema defines preferred complete metadata and allows project extensions. DiagnosticSchema, SourceLocationSchema, ReadOptionsSchema, and PlanDocumentsSchema own the corresponding boundary contracts. Known fields are validated independently during tolerant reads. PROTOCOL_VERSION is `0.1`; it is independent of the npm package version.

Source offsets count JavaScript UTF-16 code units. Lines and columns start at one. Marker value spans exclude surrounding whitespace and line endings. Entries and overview rows retain ordinalText; ordinal is null for nonpositive or unsafe integer text, avoiding rounded identities. These are observations, not general-purpose rewrite permission.

## Failures

Invalid operation arguments throw JG_PLANS_INVALID_INPUT: Invalid jg-plans input. File absence, formatting defects, encoding failures, and read failures are returned as inspection diagnostics. See the [error reference](../errors/README.md) for CLI operational mapping. ERRORS exposes the stable operational codes.

Approval, authorization, stricter profiles, coordination, retention, and execution remain consumer-owned. See the [protocol](../protocol/0.1/README.md) and [integration guide](../docs/integrations.md).
