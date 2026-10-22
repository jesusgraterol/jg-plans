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

The eight canonical pages share one registry for navigation, metadata, sitemap, and agent-facing links. Docs render the owning Markdown files; the example gallery calls the public jg-plans parser at build time. It uses the shared Tabs and CodeBlock components to pair Markdown with real JSON observations, with a no-JavaScript view that leaves all five examples readable. Documentation pages lead with visual guides and retain the complete canonical reference, with page and section navigation. Sample links open readable Markdown; there are no visitor-facing download controls. Legacy download endpoints retain source bytes for existing direct links. Raw Markdown adds an availability disclosure and preserves the canonical content.

Code windows use the shared copy behavior with a small CSS adaptation for icon-only controls, since jg-personal-astro-ui 0.4.0 has no icon-only variant. Accessible labels, state icons, live feedback, and manual-copy guidance remain supplied by the package.

Local builds default to an offline development preview. Set JG_PLANS_PUBLISHED_VERSION only when asking the build to verify that matching source version against npm. The wrapper packs the already built package in an owned temporary directory and compares complete registry payload paths/bytes. Only a match enables release labels and an exact-version install command. Missing, pending, mismatching, or unavailable evidence keeps preview presentation; registry errors are distinguished from absence. There is no alternate-registry build flag.

`assets:generate` renders the sharing image with local fonts and pinned Chromium. Inspect public/social.png, then commit it with assets/manifest.json. `assets:check` rejects stale inputs or altered output. See [the asset sources](assets/README.md) and [website ownership/delivery](../docs/website.md).

After deployment, `verify:deployment` compares live HTTPS files with the retained checked artifact and tests the real custom 404. CI downloads qualified-site into dist and verifies it without rebuilding. From a development machine, download that main run's qualified-site artifact into an empty owned `.release/checked-site/` directory, then run `pnpm --dir website verify:deployment --from ../.release/checked-site`. A local preview build is not a substitute for the CI artifact's source-commit receipt.

Check both themes at 320px, tablet, and desktop, keyboard access, native navigation without JavaScript, reduced motion, and copy success/failure. Browser tests use jg-playwright and axe; screenshots require human visual inspection as well.

## Attribution

JG components and the unchanged JG mark/favicon come from jg-personal-astro-ui under MIT. Ubuntu Sans and Ubuntu Sans Mono are locally served via the UI package's Fontsource dependencies under Ubuntu Font Licence 1.0. The deployed licenses are in public/licenses/; no font or mark is modified.
