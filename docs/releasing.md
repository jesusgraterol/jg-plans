# Releasing jg-plans

The root library/CLI is the only published workspace package. The website is private. Protocol 0.1 remains provisional independently of the npm version. GitHub Pages delivery does not depend on a successful npm publication.

## Qualified archives

Use Node.js 24.15.0 or newer and pnpm 12.14.0. `pnpm release:pack` builds, packs, installs/tests the exact archive, and writes .release/release-manifest.json. The receipt records the version, source commit, dirty-source flag, archive filename, SHA-256, SHA-512 integrity, and every shipped path's content hash. Local dirty receipts are useful during development; CI refuses them for delivery.

The [Check workflow](https://github.com/jesusgraterol/jg-plans/actions/workflows/check.yml) runs on pull requests to main, pushes to main, and manual dispatches. It qualifies one archive on Linux, then transfers that exact artifact to Node 24.15.0 and 24.22.1 consumers on Linux, macOS, and Windows. Runtime checks also exercise the filesystem and compiled package on each host. Website/browser verification runs once on Linux at 24.22.1. Publishing receives the same artifact, verifies its receipt, and never rebuilds it. No package-manager caches or long-lived publish tokens are used.

`pnpm exec node scripts/release/release.ts qualify --from <directory>` checks registry version/content compatibility. `consumer` installs/tests that receipt's archive. `verify` requires matching public contents, latest, source/workflow provenance, and npm signature verification. `verify --bootstrap` checks contents/latest without requiring provenance, only for the first manual release. Run release tooling through the pinned pnpm context so its executable is available to child package operations on every host. These commands never infer publication from a version listing alone.

Every change to a shipped file needs a new version and changelog section after that identity has been qualified or published. This includes README, canonical API/CLI/protocol docs, examples, compiled output, and the packed package.json. Private website-only changes need no version bump when the packed paths and bytes stay identical. A published same-version package is skipped only after its downloadable contents match. Different contents fail; never overwrite, unpublish, or move a frozen identity.

Registry reads have bounded bodies, reject redirects, and distinguish confirmed absence, pending tarballs, and unavailable evidence. Metadata requests allow 1 MiB, archives 8 MiB compressed, and attestation responses 4 MiB. Post-publication reconciliation shares a 15-minute deadline across requests, waits, publication and verification; the publish command runs at most once per invocation. An accepted publication with a lost response can still finish after verification. Failure requires reconciliation before another attempt.

Version presence and latest come from npm's full package metadata document. Validate the selected version before downloading its archive; unrelated historical or staged version entries are not release candidates. A missing package or absent version differs from malformed or unavailable metadata. Archive contents, integrity, latest, and provenance still require independent verification.

## First owner handoff

Do this only after both retained main artifacts have passed qualification: the manual **0.1.0 bootstrap** and the **0.1.1 automated follow-up**. The concrete handoff identifies their Actions runs, source commits, local download paths and checksums. Keep them in separate directories, such as .release/bootstrap-0.1.0/ and .release/automated-0.1.1/. Later main work may advance the automated version; keep the bootstrap archive unchanged.

1. Download the successful merged-main **qualified-package** artifact, not a PR artifact or a rebuilt alternative. Compare its receipt's source commit with that main run. Verify the archive's SHA-256 against both the receipt and the handoff, then run the local consumer command against its directory. For example, from the checkout, use `pnpm exec node scripts/release/release.ts consumer --from .release/bootstrap-0.1.0`. Do not substitute the newer archive for 0.1.0.

2. Publish that exact bootstrap archive using an isolated login. This Bash snippet runs on the owner's Linux machine from this checkout. The subshell restores all previous environment values automatically; it does not modify an existing account's npm config. Its temporary config, cache and logs have owner-only permissions. Keep the shell open for any browser/2FA approval.

   ```bash
   (
     set -euo pipefail
     shopt -s inherit_errexit
     umask 077
     jg_plans_archive="$(realpath -- .release/bootstrap-0.1.0/jg-plans-0.1.0.tgz)"
     jg_plans_npm_dir="$(mktemp -d -t jg-plans-npm-XXXXXXXX)"
     jg_plans_logged_in=0
     cleanup() {
       if [[ "$jg_plans_logged_in" == 1 ]]; then
         if ! npm logout --registry=https://registry.npmjs.org >/dev/null 2>&1; then
           printf '%s\n' 'Logout failed: revoke this temporary login in npm account settings.' >&2
         fi
       fi
       rm -rf -- "${jg_plans_npm_dir:?}"
     }
     trap cleanup EXIT
     trap 'exit 130' INT
     trap 'exit 143' TERM
     unset npm_config_userconfig npm_config_cache
     export NPM_CONFIG_USERCONFIG="$jg_plans_npm_dir/npmrc"
     export NPM_CONFIG_CACHE="$jg_plans_npm_dir/cache"
     : > "$NPM_CONFIG_USERCONFIG"
     npm login --auth-type=web --registry=https://registry.npmjs.org
     jg_plans_logged_in=1
     jg_plans_account="$(npm whoami --registry=https://registry.npmjs.org)"
     printf 'Publishing as %s\n' "$jg_plans_account"
     [[ "$jg_plans_account" == jesusgraterol ]]
     npm publish "$jg_plans_archive" --access public --ignore-scripts --registry=https://registry.npmjs.org
   )
   ```

   If login or publishing fails, the trap still removes only these temporary credentials and revokes the temporary session after successful login. Resolve any reported logout failure by revoking that login manually. Do not place tokens in commands, logs, the repository, or GitHub secrets.

3. Complete any requested browser/2FA approval. If npm stages the first publication, approve that specific release on npmjs.com. A **0.0.0-stage** placeholder is not 0.1.0; staging is conditional on the observed npm flow. After the intended version is public, run `pnpm exec node scripts/release/release.ts verify --bootstrap --from .release/bootstrap-0.1.0`. It requires the actual matching downloadable archive and latest=0.1.0. See [npm staged publishing](https://docs.npmjs.com/staged-publishing/).

4. Open [jg-plans access settings](https://www.npmjs.com/package/jg-plans/access). Add a GitHub Actions trusted publisher with user **jesusgraterol**, repository **jg-plans**, workflow filename **check.yml**, and **no environment**. Under Allowed actions, enable **npm publish**, so automated releases can finish without a staged approval. Set publishing access to **Require two-factor authentication and disallow tokens**. OIDC trusted publishing continues to work with that setting. Preserve no account secrets in this project.

5. Set the repository variable and **immediately dispatch main**:

   ```sh
   gh variable set NPM_TRUSTED_PUBLISHING_READY --body true --repo jesusgraterol/jg-plans
   gh workflow run check.yml --repo jesusgraterol/jg-plans --ref main
   gh run list --repo jesusgraterol/jg-plans --workflow check.yml --branch main --event workflow_dispatch --limit 5
   ```

   The equivalent is Settings → Secrets and variables → Actions → Variables, then [Check → Run workflow](https://github.com/jesusgraterol/jg-plans/actions/workflows/check.yml) with main selected. Setting a variable does not launch a run. Open the newly dispatched run, or use `gh run view <run-id> --repo jesusgraterol/jg-plans`. Its **Publish verified archive** job must report state **published**, version **0.1.1** (or the newer qualified main version), then verify the public archive, latest, workflow/source identity and registry/attestation signatures. The manual workflow qualifies and publishes without an active agent session or a new push.

   A disabled result, queued run, successful check alone, or already-published skip does not prove a new trusted publisher has been validated. A prior actual successful OIDC publication is reusable evidence. New trust must complete its first successful publication **within two days**; otherwise delete the expired publisher, recreate the same configuration, and dispatch immediately again. See [npm trust expiry](https://docs.npmjs.com/trusted-publishers/#trusted-publisher-configuration-expiry).

The bootstrap has no CI provenance. The automated follow-up establishes it. Final delivery additionally requires the version declared by final main and the live site's verified release presentation to agree; the bootstrap alone is insufficient.

## Refreshing website availability

After verifying the package version declared by main, run Check on main with the optional published_version input set to that same version. The website wrapper independently verifies the actual registry contents before rendering release presentation. Local builds and runs without the input remain preview builds. The checked site artifact is deployed unchanged, independently of the npm publish job. See [website delivery](website.md) for ownership and live verification.

## Failures and recovery

- **Readiness disabled:** the publish step reports state disabled and changes nothing. Complete the owner steps, set the variable, and explicitly dispatch main.
- **E403:** check the trusted publisher's Allowed actions → npm publish. **E404/ENEEDAUTH:** check the exact repository, workflow filename, no-environment setting, unexpired trust, and job-local id-token permission. **E401/EOTP:** check account/browser approval and the documented trust setup. The workflow reports a safe npm error class/exit code; other verification failures include their provider code, keeping raw input and credentials out of output.
- **Publication failed or timed out:** first inspect the run and registry. Do not blindly repeat npm publish or create a second login. Wait for the intended version and matching tarball, then run verify against its retained receipt. The workflow already reconciles for up to 15 minutes; a version listing alone still is not proof. Once publication is confirmed, rerunning main safely verifies/skips identical contents. If it is still unresolved, investigate npm's status and the failed run before authorizing another attempt.
- **Same version, different contents:** bump the version and changelog through the checked development-to-main path and qualify a new archive. Never reuse a published or frozen archive identity. Website-only work can keep the version when all shipped contents agree.
- **Provenance missing or invalid:** check that publication came from this public repository's main check.yml through OIDC. Verification checks the attested package digest, source ancestry and workflow, then runs npm audit signatures in an isolated scripts-disabled install. A same-version manual publish cannot be repaired by overwriting it; use the next qualified version.
- **Unexpected latest:** investigate the concurrent/manual publication before changing tags. The script does not blindly move latest over another release.
- **Pages:** package failure does not authorize cancelling a Pages deployment. Preserve the last verified site artifact for rollback; repair packages by a new version, never ordinary unpublishing.

Release-tool errors belong to development/release tooling; the public library's ERRORS catalog remains separate. Causes remain internal, and intentional coded messages are stable:

| Code                         | Message                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| RELEASE_INVALID_INPUT        | Invalid release input                                                        |
| RELEASE_SOURCE_MISMATCH      | Release source identity does not match the qualified archive                 |
| RELEASE_CONTENTS_CHANGED     | Shipped contents changed without a new version                               |
| RELEASE_INTEGRITY_MISMATCH   | Release archive integrity does not match                                     |
| RELEASE_REGISTRY_UNAVAILABLE | The registry could not be verified                                           |
| RELEASE_NOT_PUBLISHED        | The qualified release is not publicly downloadable                           |
| RELEASE_VERSION_NOT_HIGHER   | A new release version must be higher than the published latest version       |
| RELEASE_PUBLISH_FAILED       | Publication did not reach a verified public state; reconcile before retrying |
| RELEASE_PROVENANCE_MISSING   | Release provenance does not identify the expected main workflow and archive  |
