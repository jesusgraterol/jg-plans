# Getting started

**Development preview.** The protocol and examples are usable directly. The reference APIs and CLI are implemented; a public npm release has not been verified.

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

The [API reference](../api/README.md) describes pure parsing, checking, selected-directory inspection, exclusive creation, and targeted metadata/marker updates. The [CLI guide](../cli/README.md) describes JSON input, automation envelopes, and exits. Read the [integration boundary](integrations.md) before building approval or execution behavior on these observations.

## Make an explicit edit

Create input is ordinary JSON, for example `{ "body": "# Small change\n", "metadata": { "project": "example" } }` in create.json. From a built checkout:

```sh
node dist/cli/cli.js create --slug small-change --input create.json --json
```

Use the returned directory for inspection and updates. Update input such as `{ "document": "plan", "set": { "revision": 2, "status": "in progress" } }` changes only those requested fields. Supply updated_at explicitly when appropriate; nothing advances automatically. The [runnable example](../examples/library.mjs) shows the full library journey with cleanup limited to its own temporary directory.

Serialize each document's complete read/edit/write operation. Unsupported YAML/ambiguous markers fail without writing, detected changes are not retried, and deleted targets are never recreated. The library preserves unrelated bytes; it does not rewrite prose or coordinate competing writers.

## Contributing

The [development guide](https://github.com/jesusgraterol/jg-plans/blob/development/docs/development.md) owns checks and package/site boundaries. Tests exercise built root exports and an isolated installation of the actual tarball. The protocol remains provisional until separately approved skill and HQ integrations exercise it.
