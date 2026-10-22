# jg-plans website

The public site uses Astro static output, Tailwind, jg-personal-astro-ui, and jg-site. The shared JG package supplies components, fonts, theme, syntax highlighting, accessible copy controls, and navigation. Site-specific components explain the planning protocol.

## Development

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --dir website dev
pnpm --dir website exec playwright install chromium
pnpm --dir website check
```

`check` builds once, typechecks, runs unit/integration/browser tests against that artifact, then verifies its registered pages. To repeat the integration suite without rebuilding: `pnpm --dir website test:integration --repeats=2 --retry=0`.

The preview server used by Playwright belongs to the test runner and is stopped by its teardown. Astro's `--ignore-lock` selects a foreground instance, including inside agent sessions. Port 4322 must be free; the runner never reuses an unrelated process. Screenshots and failure traces are retained in ignored website/test-results/. Open a retained trace with `pnpm --dir website exec playwright show-trace <trace.zip>`.

## Content and presentation

src/site.config.ts explicitly registers existing routes. The protocol pages render the canonical Markdown in the repository's protocol/ directory. The home page loads the actual public examples through a named source allowlist with a 1 MiB read bound. No planning directory is discovered or loaded. Source-link routing keeps the Markdown useful on GitHub and on the website without maintaining two specifications.

The current site is a development preview. It makes no available-package claim and builds offline. Package-backed observations, all documentation routes, release verification, sharing assets, and Pages delivery are owned by later milestones.

Check both themes at 320px, tablet, and desktop, keyboard access, native navigation without JavaScript, reduced motion, and copy success/failure. Browser tests use jg-playwright and axe; screenshots require human visual inspection as well.

## Attribution

JG components and the unchanged JG mark/favicon come from jg-personal-astro-ui under MIT. Ubuntu Sans and Ubuntu Sans Mono are locally served via the UI package's Fontsource dependencies under Ubuntu Font Licence 1.0. The deployed licenses are in public/licenses/; no font or mark is modified.
