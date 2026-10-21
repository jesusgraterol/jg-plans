# Getting started

**Development preview.** The protocol and examples are usable directly. The reference read APIs and CLI are implemented; a public npm release has not been verified.

Start with an ordinary [small plan](../examples/small/plan.md). It contains five core metadata fields and a short Markdown body. Add [milestones](../examples/with-milestones/milestones.md) only when separate units help review the work. Users can edit, move, or delete these files.

## From a development checkout

Use Node.js 24.15.0 or newer and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
node dist/cli/cli.js inspect --directory examples/small --json
node dist/cli/cli.js check --directory examples/with-milestones --json
```

Inspect gives useful observations without requiring a conforming document. Check is optional. Missing files remain missing; neither operation restores history or approves execution. Document bodies are excluded from CLI output unless explicitly requested.

The [API reference](../api/README.md) describes pure parsing, checking, and selected-directory inspection. The [CLI guide](../cli/README.md) describes automation envelopes and exits. Read the [integration boundary](integrations.md) before building approval or execution behavior on these observations.

## Contributing

The [development guide](https://github.com/jesusgraterol/jg-plans/blob/development/docs/development.md) owns checks and package/site boundaries. Tests exercise built root exports and an isolated installation of the actual tarball. The protocol remains provisional until separately approved skill and HQ integrations exercise it.
