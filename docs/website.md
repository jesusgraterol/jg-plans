# Website ownership and delivery

The website is a private pnpm workspace. The root publishes the library/CLI; the website depends on that workspace and builds it first. Protocol 0.1 remains provisional independently of package availability.

## One content owner

website/src/site.config.ts owns the eight canonical page records. The layout emits metadata through jg-personal-astro-ui's DocumentHead and jg-site. Sitemap, robots.txt, llms.txt, navigation, and Markdown alternatives derive from those records. The real 404 is noindex and omitted from discovery.

The protocol, getting-started, API, CLI, integration, and example guides render their canonical Markdown files. website/src/content/sources.ts explicitly registers the public inputs. It never discovers planning roots, old plans, instruction files, or history. The gallery computes observations through jg-plans at build time; no browser parser or service is introduced. Downloads match the original files byte-for-byte. Raw Markdown adds availability context without replacing the canonical content.

## Availability is evidence

Offline local builds show development preview. With JG_PLANS_PUBLISHED_VERSION, the build first requires the requested version to match the root source version, then compares the downloadable npm archive's complete paths/content hashes with a fresh pack of the built source. A match permits an exact-version install action. Missing/pending releases, differing contents, and unavailable registry evidence suppress it. A registry error never proves absence.

The build wrapper owns verification and overwrites the internal presentation input passed to Astro. No alternate registry is exposed through its command or environment. Integration tests exercise real bounded HTTP fixtures and disposable release/unknown builds; those artifacts are never deployed. release.json records the checked artifact's version, state, provisional protocol, and CI source commit.

Cloudflare can mistake a versioned package specifier for an email address. The install component is enclosed in its documented email_off HTML comments, preserved through the production build, so the edge leaves the command intact. Cloudflare consumes the two control comments when serving it. For the published homepage only, live verification accepts the original bytes or the exact artifact with that single matched pair removed. It derives that expected response from the retained artifact, never normalizes received HTML, and rejects every other difference. Other files, source downloads and the custom 404 remain byte-exact. See [Cloudflare's obfuscation exclusions](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/#prevent-cloudflare-from-obfuscating-email).

## Checked artifact to Pages

Check verifies the package, six runtime combinations, and the website. The website job uploads the unchanged tested dist as qualified-site and, on main, as the Pages artifact. Deployment depends on package/runtime/website checks, with no dependency or condition on the publish job. A disabled, skipped, or failed npm publication does not cancel an otherwise eligible Pages deployment. Main deployments are not cancelled by later runs.

The existing github-pages environment allows main. The deployment job uses job-local Pages/OIDC permissions, deploys the artifact, then compares live HTTPS bytes with qualified-site and verifies that unknown routes return the checked custom 404. No label or file is edited between checking and deployment. Keep a successful qualified-site artifact for rollback; redeploy it rather than silently rebuilding another tree.

After npm publication is verified, manually run Check on main with published_version set to that tree's matching package version. It produces and checks a fresh release-mode artifact before deployment. Setting npm readiness alone does not refresh a site's existing presentation.

## Verification

The [website development guide](../website/README.md) owns commands and retained screenshot locations. Build verification parses HTML, checks canonical links/fragments, metadata, raw Markdown, original downloads, discovery output, and output hygiene. Browser checks cover all pages in both themes at 320px/tablet/desktop, WCAG 2.2 AA, keyboard/focus, examples, copy success/failure, downloads, no JavaScript, zoom, and reduced motion. Generated sharing assets use pinned Chromium and local licensed fonts.
