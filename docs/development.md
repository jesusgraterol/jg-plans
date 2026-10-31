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

## Essential and full suites

CI selects essential coverage on pull requests, main pushes, and existing manual runs. Full suites run locally only when explicitly requested. There is no full CI input, schedule, or recurring manual routine. Complete focused checks still cover changed behavior and consumers, including affected full-only cases; reuse successful evidence while its relevant inputs remain unchanged.

Essential protects guarded document writes, byte preservation, stale-source rejection, lock ownership and cleanup, bounded file/process/archive operations, private-body omission, correct milestone/criterion parsing and progress (including fences, markers, aliases, encoding, and ambiguous overviews), refusal of unsafe or unavailable fingerprints, and exact error-code collision membership. The large-diagnostic regression stays essential: a document within the supported 1 MiB input bound must produce every finding without overflowing the call stack. Package installation and release identity/provenance checks remain essential. Website essentials protect verified package availability, private-path/source-download rejection, and exact deployed-artifact comparisons.

Full adds derived display names, diagnostic-location presentation, sorting permutations, additional large-input qualifications, public-example inventories, CLI help/version output, website link/lifecycle demonstrations, and every browser case. Core parsing, preservation, fingerprint safety, and stack-safe checking stay essential even when a scenario involves formatting, input size, or an error case. Browser accessibility, keyboard/focus, responsive layout, themes, and motion assertions remain complete in full and focused commands; add no essential browser smoke.

Classify each new or materially changed scenario by its concrete failure consequence. Speed, test level, and frontend/backend location do not determine membership. Unassessed cases remain essential until assessed. Keep mixed families co-located and mark useful secondary cases with the declared Vitest `full` tag. Entirely full-only files must also be excluded before imports; entirely full-only categories omit their preparation. Unexpectedly empty required selections must fail.

### Current published-version boundary

The root `package.json` and `README.md` ship in the already published package. Their command edits wait for the next normal release; this testing cleanup introduces no version or publication. Until then, root `test` and `check:package` retain complete package coverage. Root `check` runs that package boundary followed by the website's essential check. Complete granular commands remain unchanged by default.

CI temporarily composes the existing native package commands, with one build:

```sh
pnpm build && pnpm test:unit --tagsFilter='!full' && pnpm test:integration --tagsFilter='!full' && pnpm typecheck && pnpm lint && pnpm format:check
```

The package and all six runtime jobs use this selection. Website `test`/`check` select essential; `test:full`/`check:full` retain complete website coverage. Essential website aggregates use native `--mode essential` for file exclusions and `--tagsFilter=!full` for mixed cases. They exclude `src/content/utilities.test-unit.ts` and `scripts/lifecycle/lifecycle.test-integration.ts` before loading them and omit browser E2E. Default `test` mode keeps complete granular/focused discovery; unsupported modes fail. Vitest 5.0.5 does not forward CLI `--exclude` into inline projects, so those exclusions live in the owning configuration. Granular/focused commands include those cases by default; invocation-local flags cannot affect later commands.

At the next normal release, root `test`/`check:package`/`check` will select essential and corresponding `:full` commands will select complete coverage. Replace CI's temporary package composition with `pnpm check:package` in the same change, retaining one authoritative command path.

Release packing, qualification, consumer checks, receipt verification, and delivery prerequisites remain complete and unchanged. Before delivering package-neutral testing changes independently, verify an actual consumer-tested archive against the registry: the result must be `published` with identical shipped paths/bytes. Keep owned archives outside any pre-existing `.release/` output and remove disposable evidence after successful verification.

## Package checks

Root `test` builds before running unit and integration categories. Public-library unit tests import the built root, not implementation source; development-tool tests exercise their owning modules. Integration tests use real temporary files and compiled CLI processes. The packed-consumer test checks the actual archive payload against the allowlist, installs it with scripts disabled, compares every installed payload file byte-for-byte, compiles a TypeScript consumer, checks ESM/require imports and private-path rejection, and invokes the installed executable. Its temporary login/config/cache and filesystem resources are removed in finally blocks.

Archive inspection uses tar as a development-only parser, with no extraction: at most 8 MiB compressed, 16 MiB expanded, 1 MiB per file, and 4096 file entries. Unsafe paths, links, duplicate entries, and nested compression fail verification. Package-manager-generated binary wrappers are tested by invocation and are distinct from the archive payload. Public error, getting-started, and integration references ship with the API/CLI documentation; the consumer check also verifies their relative document links. Development, release, and website source guides remain repository-only.

`check:package` composes complete package tests with type, lint, and format checks. Root `check` runs that package boundary followed by the website's essential production checks, in an explicit order; the root public package and private website share a pnpm workspace/lockfile. The website declares jg-plans through workspace:\* and builds the root before reading its exports. `release:pack` builds, writes a local archive under ignored .release/, and verifies that exact retained archive through the installed consumer; it does not publish. Build and archive scripts bound child processes and forward shutdown signals. CI qualifies essential package guarantees on Node 24.15.0 and 24.22.1 across Linux, macOS, and Windows; essential website checks run once on Linux at 24.22.1. Full browser checks run locally on request.

The installed executable performs create → inspect → update → write → check → remove → create-milestones against its real bin shim, and the shipped examples/library.mjs is run from the installed archive. Creation failures exercise actual prefix writes and cleanup; conflict tests control only the external write boundary before invoking the real atomic comparison. Byte-preservation expectations are independent literal buffers, not parser-generated expected output.

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

Test public built exports and the installed executable. Keep known-field diagnostics separate from tolerant source observations and verify every byte outside targeted edit spans. Filesystem mutations share canonical local document locks; detected conflicts are failures, never an instruction to retry over newer user content.

## Delivery prerequisites

GitHub Pages uses Actions for jg-plans.jesusgraterol.dev. Recheck repository access, Actions permissions, branch policies, domain/certificate readiness, and HTTPS enforcement before delivery.

Release only the qualified main archive through the configured Check workflow. Verify registry contents and provenance independently of website delivery; a successful build alone establishes neither publication nor deployment. The [release runbook](releasing.md) owns these checks and recovery. Its original 0.1.0/0.1.1 owner bootstrap is explicitly historical and is not repeated for later releases. Any manual account setup or recovery uses an isolated temporary npm login without changing another account's configuration.
