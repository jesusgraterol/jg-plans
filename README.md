# jg-plans

A compact planning protocol for people and coding agents. Keep the plan in Markdown, add milestones when they help, and let projects choose their workflows.

**Development preview:** the provisional protocol, public examples, first website pages, and reference library/CLI are implemented in this repository. npm installation and a live release are not yet advertised.

- [Protocol 0.1](protocol/0.1/README.md)
- [Examples](examples/README.md)
- [Getting started](docs/getting-started.md)
- [Library API](api/README.md) and [CLI](cli/README.md)
- [Consumer integration](docs/integrations.md)
- [Development](https://github.com/jesusgraterol/jg-plans/blob/development/docs/development.md)
- [Website development and visual checks](https://github.com/jesusgraterol/jg-plans/blob/development/website/README.md)

## Project blueprint

| Area                                 | Ownership                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| protocol/                            | Normative versioned specification and version index.                                                     |
| examples/                            | Invented public documents and independently described expected observations.                             |
| docs/                                | Concise durable concepts and operating guides; API and HTTP/error references stay outside docs/.         |
| Root package                         | Reference library and thin CLI, introduced with their tested implementation.                             |
| src/                                 | Protocol schemas, tolerant parsers, selected-directory reads, targeted metadata/marker edits, and CLI.   |
| api/, cli/, errors/                  | Canonical public API, automation, and error references.                                                  |
| scripts/package/                     | Build, local archive creation, and isolated installed-consumer verification.                             |
| scripts/release/, .github/workflows/ | Source/checksum receipts, registry/provenance verification, and qualified delivery.                      |
| website/                             | Private Astro/Tailwind workspace, introduced with real production pages and canonical content rendering. |
| .agents/skills/jg-plans-maintenance/ | Shared project maintenance skill; Claude discovers the same source through its repository symlink.       |

Users own their documents and can edit or delete them. No history store, metadata field, CLI, or website is required to read Markdown. Optional conformance checks do not authorize execution or become a prerequisite to inspection.

The protocol stays separate from application schemas, approvals, resource allocations, locking and reconciliation. Future jg-skills and HQ adoption are independent integrations.

## Development

Use Node.js 24.15.0 or newer and pnpm 12.14.0.

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm check:package
pnpm check
```

The [development guide](https://github.com/jesusgraterol/jg-plans/blob/development/docs/development.md) owns checks and package/site boundaries. Root tests build first, exercise public compiled exports, and install the actual tarball in an isolated consumer. Website tests verify production output in both themes and narrow layouts.

The [runnable library example](examples/library.mjs) creates, inspects, updates, and checks documents in an owned temporary directory. Mutations preserve unrelated bytes and require callers to serialize edits to each document; unsupported edits fail without rewriting it. The [API](api/README.md) describes the exact preservation and concurrency limits.

## License

[MIT](LICENSE), copyright Jesus Graterol.
