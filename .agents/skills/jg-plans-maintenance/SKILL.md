---
name: jg-plans-maintenance
description: Maintain the jg-plans protocol, reference library and CLI, examples, and documentation website. Use for changes inside this repository that affect their shared contracts or delivery.
---

# JG Plans maintenance

Use the current task's authorization and the repository's engineering guidance. This skill owns the connections between the protocol, implementation, examples, and website.

## Find the owning source

Read [the project blueprint](../../../README.md), then the relevant parts of [protocol 0.1](../../../protocol/0.1/README.md) and [the examples](../../../examples/README.md). The protocol directory is normative; the website renders canonical files rather than maintaining another specification.

For implementation commands and dependency ownership, read [development](../../../docs/development.md). When changing publication, also read docs/releasing.md once that workflow exists. Resolve JG Packages APIs from the installed package's bundled documentation before using an export.

## Preserve the document boundary

- Keep optional milestones, unknown metadata and custom statuses useful. Missing or deleted material never implies approval, completion, or a need to restore history.
- Keep project schemas, approvals, digests, registries, coordination journals and reconciliation with consumers. Protocol 0.1 stays provisional until separately scoped skill and HQ adoption exercises it.
- Keep narrow patches, explicit guarded body/source writes, guarded removal, and pure preparation on the same edit engine. Assign missing UUIDs only on request. Preserve every other byte, including encoding/BOM and line-ending details; report unsupported edits without silently normalizing prose.
- Filesystem mutations and consumer persistence share canonical local document locks. Inside the public callback use pure preparation and your own persistence, never nested mutation calls. Busy/dead owners require explicit operator inspection; failed release may follow durable writes. Atomic replacement and prior-content comparison do not remove the nonparticipating-writer race.

## Keep evidence and publication aligned

Use invented conformance fixtures or attributed, clearly licensed public examples. Never copy private project plans into public fixtures. Keep expected observations independent of parser output and verify that code fences and partly deleted documents remain inspectable.

Change contracts together with their owning schemas, exports, TSDoc, errors, tests, and canonical docs/examples. Test built public exports and the installed executable; prove edit preservation independently of parser success. Add browser checks to website changes in both themes and narrow layouts.

When shipped content changes after a qualified release, bump the package version and qualify its new archive. Publish the tested archive, and advertise availability only after registry contents match. Pages delivery remains independent of npm bootstrap and uses honest preview presentation until a matching release is verified.
