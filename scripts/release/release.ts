import { resolve } from 'node:path';
import { extractMessage, getErrorCode } from 'jg-exception';
import {
  createShutdownSignal,
  parseStrictArgs,
  resolvePackageManagerCommand,
  runProcess,
} from 'jg-process';

import { packageRoot, verifyPackedConsumer } from '../package/index.ts';

import { releaseErrors } from './constants.ts';
import { readRelease } from './manifest.ts';
import { verifyRegistryProvenance } from './provenance.ts';
import { publishRelease } from './publish.ts';
import { observePublished, qualifyVersion, readLatest } from './registry.ts';

const shutdown = createShutdownSignal({ forceOnRepeat: true });
try {
  const [command, ...args] = process.argv.slice(2);
  const flags = parseStrictArgs(args, { from: { type: 'string' }, bootstrap: { type: 'boolean' } });
  if (
    !['qualify', 'consumer', 'publish', 'verify'].includes(command ?? '') ||
    (flags.bootstrap && command !== 'verify')
  )
    throw releaseErrors.create('invalidInput');
  const { manifest, archive, bytes } = await readRelease(resolve(flags.from ?? '.release'));
  if (
    command === 'publish' &&
    (process.env.GITHUB_REF !== 'refs/heads/main' ||
      process.env.GITHUB_REPOSITORY !== 'jesusgraterol/jg-plans')
  )
    throw releaseErrors.create('sourceMismatch');
  if (process.env.CI && (manifest.sourceDirty || manifest.sourceCommit !== process.env.GITHUB_SHA))
    throw releaseErrors.create('sourceMismatch');
  const context = { signal: shutdown.signal, candidateArchive: bytes };
  let result: unknown;
  if (command === 'consumer') {
    await verifyPackedConsumer(archive, shutdown.signal);
    result = { state: 'consumer-verified', version: manifest.version };
  } else if (command === 'qualify') {
    const observed = await qualifyVersion(manifest, context);
    result = { state: observed.state, version: manifest.version };
  } else if (command === 'verify') {
    const observed = await observePublished(manifest, context);
    if (observed.state !== 'published' || (await readLatest(context)) !== manifest.version)
      throw releaseErrors.create('notPublished');
    if (!flags.bootstrap)
      await verifyRegistryProvenance(
        observed.metadata,
        observed.bytes,
        manifest.sourceCommit,
        shutdown.signal,
      );
    result = { state: 'verified', version: manifest.version, provenance: !flags.bootstrap };
  } else {
    result = await publishRelease(manifest, {
      ready: process.env.NPM_TRUSTED_PUBLISHING_READY === 'true',
      candidateArchive: bytes,
      signal: shutdown.signal,
      publish: async (signal) => {
        const published = await runProcess({
          ...resolvePackageManagerCommand(
            ['publish', archive, '--access', 'public', '--provenance', '--ignore-scripts'],
            { packageManager: 'npm', cwd: packageRoot },
          ),
          cwd: packageRoot,
          signal,
          timeoutSeconds: 120,
          maxOutputBytes: 1024 * 1024,
          env: { ...process.env, NPM_CONFIG_PROVENANCE: 'true' },
        });
        if (published.exitCode !== 0) {
          const npmCode = /\bE(?:401|403|404|NEEDAUTH|OTP|PUBLISHCONFLICT)\b/.exec(
            published.stderr,
          )?.[0];
          console.error(
            JSON.stringify({
              step: 'npm-publish',
              exitCode: published.exitCode,
              ...(npmCode ? { npmCode } : {}),
            }),
          );
          throw releaseErrors.create('publishFailed', {
            data: { exitCode: published.exitCode, ...(npmCode ? { npmCode } : {}) },
          });
        }
      },
      verifyProvenance: (metadata, bytes, signal) =>
        verifyRegistryProvenance(metadata, bytes, manifest.sourceCommit, signal),
    });
  }
  if (!shutdown.receivedSignal()) console.info(JSON.stringify(result));
} catch (cause) {
  if (shutdown.receivedSignal()) process.exitCode = shutdown.exitCode() ?? 1;
  else {
    console.error(
      releaseErrors.is(cause)
        ? `${cause.code}: ${extractMessage(cause)}`
        : `Release verification failed (${getErrorCode(cause) ?? 'UNKNOWN'}); inspect the selected artifact and command.`,
    );
    process.exitCode = 1;
  }
} finally {
  shutdown.dispose();
}
