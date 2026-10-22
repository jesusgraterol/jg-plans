import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readResponseBytes, request } from 'jg-fetch';
import { createShutdownSignal, isMainModule, parseStrictArgs } from 'jg-process';

import { SiteReleaseSchema } from '../src/availability.ts';
import { SITE } from '../src/site.config.ts';
import { readSiteFiles } from './verify-build.ts';

/** Require the live HTTPS deployment to match the unchanged, locally retained checked artifact. */
export const verifyDeployment = async (
  directory = resolve(import.meta.dirname, '../dist'),
  signal?: AbortSignal,
): Promise<void> => {
  const files = await readSiteFiles(directory);
  const expected = SiteReleaseSchema.parse(JSON.parse(files.get('release.json')!.toString('utf8')));
  const deadline = AbortSignal.any([AbortSignal.timeout(120_000), ...(signal ? [signal] : [])]);
  // Pages/CDN propagation is observable through this exact build receipt, not an arbitrary sleep.
  for (;;) {
    deadline.throwIfAborted();
    const observed = await request(`${SITE.url}/release.json`, {
      signal: deadline,
      timeoutSeconds: 10,
      retryDelaysSeconds: [],
      maxResponseBytes: 1024 * 1024,
      schema: SiteReleaseSchema,
      init: { redirect: 'error', cache: 'no-store' },
    });
    if (!observed.error && JSON.stringify(observed.data) === JSON.stringify(expected)) break;
    await delay(2000, undefined, { signal: deadline });
  }
  for (const [path, bytes] of files) {
    if (path === 'CNAME' || path === '.nojekyll') continue;
    const route =
      path === 'index.html'
        ? '/'
        : path.endsWith('/index.html')
          ? `/${path.slice(0, -10)}`
          : `/${path}`;
    const observed = await fetch(new URL(route, SITE.url), {
      signal: AbortSignal.any([deadline, AbortSignal.timeout(10_000)]),
      redirect: 'error',
      cache: 'no-store',
    });
    const received = await readResponseBytes(observed, 4 * 1024 * 1024);
    assert.ok(
      path === '404.html' ? [200, 404].includes(observed.status) : observed.status === 200,
      `${route}: live file unavailable`,
    );
    assert.deepEqual(
      Buffer.from(received),
      bytes,
      `${route}: live bytes differ from checked artifact`,
    );
  }
  const missing = await fetch(`${SITE.url}/__jg_plans_missing_page__`, {
    signal: AbortSignal.any([deadline, AbortSignal.timeout(10_000)]),
    redirect: 'error',
  });
  const missingBody = await readResponseBytes(missing, 1024 * 1024);
  assert.equal(missing.status, 404, 'Unknown routes must return a real 404');
  assert.deepEqual(
    Buffer.from(missingBody),
    files.get('404.html'),
    'Unknown routes must serve the checked custom 404',
  );
  console.info(
    `Verified live HTTPS artifact: ${expected.version}, ${expected.state}, source ${expected.sourceCommit ?? 'local'}.`,
  );
};

if (isMainModule(import.meta.url)) {
  const shutdown = createShutdownSignal({ forceOnRepeat: true });
  try {
    const flags = parseStrictArgs(process.argv.slice(2), { from: { type: 'string' } });
    await verifyDeployment(
      flags.from === undefined ? undefined : resolve(flags.from),
      shutdown.signal,
    );
  } catch (cause) {
    if (shutdown.receivedSignal()) process.exitCode = shutdown.exitCode() ?? 1;
    else throw cause;
  } finally {
    shutdown.dispose();
  }
}
