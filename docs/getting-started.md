# Getting started

The protocol and examples are usable directly. The reference library and CLI are optional; the [website's availability label](https://jg-plans.jesusgraterol.dev/docs/) identifies a verified published version. The checkout commands below work independently of npm publication.

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

The [API reference](../api/README.md) describes pure parsing, checking, selected-directory inspection, exclusive creation, pure preparation, guarded body/source writes, marker updates, removal, and shared locks. The [CLI guide](../cli/README.md) describes JSON input, automation envelopes, and exits. Read the [integration boundary](integrations.md) before building approval or execution behavior on these observations.

## Make an explicit edit

Create input is ordinary JSON, for example `{ "body": "# Small change\n", "metadata": { "project": "example" } }` in create.json. From a built checkout:

```sh
node dist/cli/cli.js create --slug small-change --input create.json --json
```

Use the returned directory for inspection and updates. Update input such as `{ "document": "plan", "set": { "revision": 2, "status": "in progress" } }` changes only those requested fields. Supply updated_at explicitly when appropriate; nothing advances automatically. The [runnable example](../examples/library.mjs) shows the full library journey with cleanup limited to its own temporary directory.

Inspect exact hashes and supply expectedSha256 for guarded edits. Shared local document locks coordinate library, CLI, and participating consumers. Unsupported affected YAML/ambiguous markers fail without writing, detected changes are not retried, and existing-target expectations never recreate deleted files. Use explicit body/source writes when replacing prose; all unaffected bytes remain intact.

## Contributing

The [development guide](https://github.com/jesusgraterol/jg-plans/blob/main/docs/development.md) owns checks and package/site boundaries. Tests exercise built root exports and an isolated installation of the actual tarball. The protocol remains provisional until separately approved skill and HQ integrations exercise it.
