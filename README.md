# jg-plans

A compact planning protocol for people and coding agents. Keep the plan in Markdown, add milestones when they help, and let projects choose their workflows. This repository owns the protocol, its reference TypeScript library and CLI, public examples and documentation website.

Protocol 0.2 is provisional and is the only supported version; unversioned Markdown uses its rules. The current library/CLI uses CLI JSON schema 3. The [website](https://jg-plans.jesusgraterol.dev) presents the specification, documentation, and examples, with package availability verified independently of the protocol draft.

## Project blueprint

| Task                                                    | Documentation                                                                                                                                             |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand document format and reader/writer semantics  | [Protocol 0.2](protocol/0.2/README.md), the normative provisional specification.                                                                          |
| Install and make a first request                        | [Getting started](docs/getting-started.md).                                                                                                               |
| Use the reference library or executable                 | [Library API](api/README.md) and [CLI](cli/README.md), with public operation and automation contracts.                                                    |
| Integrate with a host workflow                          | [Consumer integration](docs/integrations.md), covering application-owned approval and execution boundaries.                                               |
| Inspect expected observations or run a complete example | [Examples](examples/README.md) and [runnable library example](examples/library.mjs).                                                                      |
| Develop, verify or release the package                  | [Development](https://github.com/jesusgraterol/jg-plans/blob/main/docs/development.md), with source ownership, checks, packaging and preservation limits. |
| Work on the documentation site                          | [Website development](https://github.com/jesusgraterol/jg-plans/blob/main/website/README.md), with canonical sources, artifact and visual verification.   |
| Integrate or deliver reviewed work                      | [Delivery](https://github.com/jesusgraterol/jg-plans/blob/main/docs/delivery.md), defining stops, operators and evidence.                                 |

`protocol/` owns the versioned format; `src/` owns the library and thin CLI; `api/`, `cli/` and `errors/` own public references. `scripts/` owns build/archive/release tooling and `website/` owns the private site. `docs/` contains durable guides, with repository-only development references linked above by absolute URL.

<!-- testing-commands:start -->

## Testing

`pnpm test` and `pnpm check` select essential coverage. `pnpm test:full`, `pnpm check:package:full`, and `pnpm check:full` retain complete package or package/website checks. Granular test commands remain complete by default. See the [testing policy](https://github.com/jesusgraterol/jg-plans/blob/main/docs/development.md#essential-and-full-suites) for placement, affected-consumer verification, and the explicit-request full trigger.

<!-- testing-commands:end -->

## License

[MIT](LICENSE), copyright Jesus Graterol.
