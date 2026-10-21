# Development

Use Node.js 24.15.0 or newer and the package manager pinned in package.json. The repository is a publishable root package with one private website workspace; no Turborepo or extra internal packages are needed.

## Current commands

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm --dir website dev
pnpm --dir website exec playwright install chromium
pnpm --dir website check
```

Use pnpm format to format editable source/docs. Protected instruction files, planning records, generated lockfiles, and byte-sensitive example/fixture documents are excluded from the formatter.

The [website guide](../website/README.md) describes the production pages, canonical content, browser checks, and retained screenshots. Website checks build once and test that artifact. Runtime build/test/type/lint commands arrive with the library/CLI.

## Ownership

- protocol/ owns the normative versioned format.
- examples/ owns invented public documents and independently described expected observations.
- The root package owns the reference TypeScript library and thin executable as they are implemented.
- website/ owns the private Astro/Tailwind website as it is implemented, rendering canonical sources rather than copying them.
- docs/ holds concise durable guides; API and error references belong outside docs/ in their owning directories.

Use the approved exact dependency baselines and JG Packages. Read the actual resolved package's API.md/RECIPES.md before using an export. Add each tool or dependency with the boundary that needs it, maintain one pnpm lockfile, and approve only necessary dependency build scripts.

## Conformance and preservation

Start from the independently specified observations in examples/README.md. Add synthetic parser/encoding/edit fixtures alongside owning implementation tests, never by copying private plans. Do not auto-format byte-sensitive inputs or compute expected results from the parser being tested.

Test public built exports and the installed executable. Keep known-field diagnostics separate from tolerant source observations and verify every byte outside targeted edit spans. Consumers serialize document mutations; detected conflicts are failures, never an instruction to retry over newer user content.

## First delivery prerequisites

GitHub Pages is configured through Actions for jg-plans.jesusgraterol.dev. Recheck repository access, Actions permissions, branch policies, and domain/certificate readiness before delivery. Verify HTTPS enforcement when a Pages certificate/deployment is available.

The owner uses an isolated temporary npm login for the qualified first-publication handoff, preserving any account configured for other work. Verify the intended owner account and 2FA readiness then; account setup does not block independent website delivery.

The release workflow and exact tested artifacts must exist on main before that owner step. The later runbook will include the retained bootstrap archive, trusted-publisher settings, immediate owner-started main workflow, and the evidence needed to distinguish a real publication from a skip. Website delivery remains independent of npm availability.
