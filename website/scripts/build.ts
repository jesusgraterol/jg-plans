import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createShutdownSignal, resolvePackageManagerCommand, runProcess } from 'jg-process';

import { verifyAvailability } from './availability.ts';

const website = resolve(import.meta.dirname, '..');
const root = resolve(website, '..');
const shutdown = createShutdownSignal({ forceOnRepeat: true });
try {
  const build = await runProcess({
    ...resolvePackageManagerCommand(['build'], { cwd: root, packageManager: 'pnpm' }),
    cwd: root,
    signal: shutdown.signal,
    timeoutSeconds: 120,
    maxOutputBytes: 1024 * 1024,
  });
  assert.equal(build.exitCode, 0, 'Root package build failed');
  const availability = await verifyAvailability(process.env.JG_PLANS_PUBLISHED_VERSION, {
    signal: shutdown.signal,
  });
  const site = await runProcess({
    ...resolvePackageManagerCommand(['exec', 'astro', 'build'], {
      cwd: website,
      packageManager: 'pnpm',
    }),
    cwd: website,
    signal: shutdown.signal,
    timeoutSeconds: 180,
    maxOutputBytes: 4 * 1024 * 1024,
    env: { ...process.env, JG_PLANS_VERIFIED_AVAILABILITY: JSON.stringify(availability) },
  });
  if (shutdown.receivedSignal()) process.exitCode = shutdown.exitCode() ?? 1;
  else {
    if (site.stdout) process.stdout.write(site.stdout);
    if (site.stderr) process.stderr.write(site.stderr);
    assert.equal(site.exitCode, 0, 'Website build failed');
    console.info(JSON.stringify({ schemaVersion: 1, ...availability }));
  }
} catch (cause) {
  if (shutdown.receivedSignal()) process.exitCode = shutdown.exitCode() ?? 1;
  else throw cause;
} finally {
  shutdown.dispose();
}
