# jg-plans

A compact planning protocol for people and coding agents. Keep the plan in Markdown, add milestones when they help, and let projects choose their workflows.

Protocol 0.2 is provisional and is the only supported version; unversioned Markdown uses its rules. The 0.5.0 library/CLI uses CLI JSON schema 2. The [website](https://jg-plans.jesusgraterol.dev) presents the specification, documentation, and examples, with package availability verified independently of the protocol draft.

- [Protocol 0.2](protocol/0.2/README.md)
- [Examples](examples/README.md)
- [Getting started](docs/getting-started.md)
- [Library API](api/README.md) and [CLI](cli/README.md)
- [Consumer integration](docs/integrations.md)
- [Development](https://github.com/jesusgraterol/jg-plans/blob/main/docs/development.md)
- [Website development and visual checks](https://github.com/jesusgraterol/jg-plans/blob/main/website/README.md)

## Project blueprint

| Area                                 | Ownership                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| protocol/                            | Normative versioned specification and version index.                                                     |
| examples/                            | Invented public documents and independently described expected observations.                             |
| docs/                                | Concise durable concepts and operating guides; API and HTTP/error references stay outside docs/.         |
| Root package                         | Public reference library and thin CLI.                                                                   |
| src/                                 | Protocol schemas, tolerant parsers, selected-directory reads, targeted metadata/marker edits, and CLI.   |
| api/, cli/, errors/                  | Canonical public API, automation, and error references.                                                  |
| scripts/package/                     | Build, local archive creation, and isolated installed-consumer verification.                             |
| scripts/release/, .github/workflows/ | Source/checksum receipts, registry/provenance verification, and qualified delivery.                      |
| website/                             | Private Astro/Tailwind workspace for canonical docs, parsed examples, and verified release presentation. |
| .agents/skills/jg-plans-maintenance/ | Shared project maintenance skill; Claude discovers the same source through its repository symlink.       |

Users own their documents and can edit or delete them. No history store, metadata field, CLI, or website is required to read Markdown. Optional conformance checks do not authorize execution or become a prerequisite to inspection.

Plans declare their priority, the repositories they change, and the error codes they add, as explicit string/number lists. `jg-plans overlaps` compares String(code) and reports shared codes in active plans. Parsed results also expose a name derived from the plan ID. Approvals, allocation services, locks and reconciliation stay with applications, and jg-skills and HQ integrate independently.

## Development

Use Node.js 24.15.0 or newer and pnpm 12.14.0.

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm check:package
pnpm check
```

The [development guide](https://github.com/jesusgraterol/jg-plans/blob/main/docs/development.md) owns checks and package/site boundaries. Root tests build first, exercise public compiled exports, and install the actual tarball in an isolated consumer. Website tests verify production output in both themes and narrow layouts.

The [runnable library example](examples/library.mjs) creates, inspects, updates, and checks documents in an owned temporary directory. Guarded mutations and pure preparation preserve unaffected bytes and share local document locks; unsupported edits fail without rewriting it. The [API](api/README.md) describes the exact preservation and concurrency limits.

## License

[MIT](LICENSE), copyright Jesus Graterol.
