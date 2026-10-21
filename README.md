# jg-plans

A compact planning protocol for people and coding agents. Keep the plan in Markdown, add milestones when they help, and let projects choose their workflows.

**Development preview:** the provisional protocol and public examples are available in this repository. The reference TypeScript library, CLI, and visual documentation website are being implemented. npm installation and a live release are not yet advertised.

- [Protocol 0.1](protocol/0.1/README.md)
- [Examples](examples/README.md)
- [Consumer integration](docs/integrations.md)
- [Development](docs/development.md)

## Project blueprint

| Area                                 | Ownership                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| protocol/                            | Normative versioned specification and version index.                                                     |
| examples/                            | Invented public documents and independently described expected observations.                             |
| docs/                                | Concise durable concepts and operating guides; API and HTTP/error references stay outside docs/.         |
| Root package                         | Reference library and thin CLI, introduced with their tested implementation.                             |
| website/                             | Private Astro/Tailwind workspace, introduced with real production pages and canonical content rendering. |
| .agents/skills/jg-plans-maintenance/ | Shared project maintenance skill; Claude discovers the same source through its repository symlink.       |

Users own their documents and can edit or delete them. No history store, metadata field, CLI, or website is required to read Markdown. Optional conformance checks do not authorize execution or become a prerequisite to inspection.

The protocol stays separate from application schemas, approvals, resource allocations, locking and reconciliation. Future jg-skills and HQ adoption are independent integrations.

## Development

Use Node.js 24.15.0 or newer and pnpm 12.14.0.

```sh
pnpm install --frozen-lockfile
pnpm format:check
```

The [development guide](docs/development.md) lists the current commands and package/site boundaries. Runtime APIs and commands are documented with their implementation, not as untested placeholders.

## License

[MIT](LICENSE), copyright Jesus Graterol.
