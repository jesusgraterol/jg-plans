# Development

Use Node.js 24.15.0 or newer and the package manager pinned in package.json. The repository is a publishable root package with one private website workspace; no Turborepo or extra internal packages are needed.

## Current commands

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm check:package
pnpm check
pnpm release:pack
pnpm --dir website dev
pnpm --dir website exec playwright install chromium
pnpm --dir website check
pnpm --dir website assets:check
pnpm --dir website verify:deployment
```

Use pnpm format to format editable source/docs. Protected instruction files, planning records, generated lockfiles, byte-sensitive example/fixture documents, and the unchanged licensed JG mark are excluded from the formatter. Regenerate the sharing-image receipt after changing its formatted source.

The [website guide](../website/README.md) describes the production pages, canonical content, browser checks, and retained screenshots. Website checks build once and test that artifact.

Root `test` builds before running unit and integration categories. Public-library unit tests import the built root, not implementation source; development-tool tests exercise their owning modules. Integration tests use real temporary files and compiled CLI processes. The packed-consumer test checks the actual archive payload against the allowlist, installs it with scripts disabled, compares every installed payload file byte-for-byte, compiles a TypeScript consumer, checks ESM/require imports and private-path rejection, and invokes the installed executable. Its temporary login/config/cache and filesystem resources are removed in finally blocks.

Archive inspection uses tar as a development-only parser, with no extraction: at most 8 MiB compressed, 16 MiB expanded, 1 MiB per file, and 4096 file entries. Unsafe paths, links, duplicate entries, and nested compression fail verification. Package-manager-generated binary wrappers are tested by invocation and are distinct from the archive payload. Public error, getting-started, and integration references ship with the API/CLI documentation; the consumer check also verifies their relative document links. Development, release, and website source guides remain repository-only.

`check:package` composes those tests with type, lint, and format checks. Root `check` runs that package boundary followed by the website's production checks, in an explicit order; the root public package and private website share a pnpm workspace/lockfile. The website declares jg-plans through workspace:\* and builds the root before reading its exports. `release:pack` builds, writes a local archive under ignored .release/, and verifies that exact retained archive through the installed consumer; it does not publish. Build and archive scripts bound child processes and forward shutdown signals. Check qualifies Node 24.15.0 and 24.22.1 across Linux, macOS, and Windows; website/browser checks run once on Linux at 24.22.1.

The installed executable performs create → inspect → update → check against its real bin shim, and the shipped examples/library.mjs is run from the installed archive. Creation failures exercise actual prefix writes and cleanup; conflict tests control only the external write boundary before invoking the real atomic comparison. Byte-preservation expectations are independent literal buffers, not parser-generated expected output.

Run changed integration tests three consecutive times without retries: `pnpm test:integration --repeats=2 --retry=0`. Reuse existing successful checks when their inputs are unchanged. Native symlink rejection is tested on POSIX; nonregular-file failures are tested on every host.

## Ownership

- protocol/ owns the normative versioned format.
- examples/ owns invented public documents and independently described expected observations.
- The root package owns the reference TypeScript library and thin executable as they are implemented.
- src/ owns protocol schemas, document parsing, selected-file observations, and the CLI. Tests are co-located with those implementations.
- api/, cli/, and errors/ own public references. scripts/package/ owns build, archive, and installed-consumer checks.
- website/ owns the private Astro/Tailwind website as it is implemented, rendering canonical sources rather than copying them.
- docs/ holds concise durable guides; API and error references belong outside docs/ in their owning directories.

Use the approved exact dependency baselines and JG Packages. Read the actual resolved package's API.md/RECIPES.md before using an export. Add each tool or dependency with the boundary that needs it, maintain one pnpm lockfile, and approve only necessary dependency build scripts.

## Conformance and preservation

Start from the independently specified observations in examples/README.md. Add synthetic parser/encoding/edit fixtures alongside owning implementation tests, never by copying private plans. Do not auto-format byte-sensitive inputs or compute expected results from the parser being tested.

Test public built exports and the installed executable. Keep known-field diagnostics separate from tolerant source observations and verify every byte outside targeted edit spans. Consumers serialize document mutations; detected conflicts are failures, never an instruction to retry over newer user content.

## First delivery prerequisites

GitHub Pages is configured through Actions for jg-plans.jesusgraterol.dev. Recheck repository access, Actions permissions, branch policies, and domain/certificate readiness before delivery. Verify HTTPS enforcement when a Pages certificate/deployment is available.

The owner uses an isolated temporary npm login for the qualified first-publication handoff, preserving any account configured for other work. Verify the intended owner account and 2FA readiness then; account setup does not block independent website delivery.

The release workflow and exact tested artifacts must exist on main before that owner step. The [release runbook](releasing.md) covers retained bootstrap/automated archives, isolated account setup, trusted-publisher settings, immediate owner-started main dispatch, and evidence distinguishing actual publication from a skip. Website delivery remains independent of npm availability.
