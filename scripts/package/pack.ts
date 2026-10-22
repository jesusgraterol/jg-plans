import { resolve } from 'node:path';
import { createShutdownSignal } from 'jg-process';

import { writeReleaseManifest } from '../release/index.ts';

import { verifyPackedConsumer } from './consumer.ts';
import { packageRoot, packPackage } from './utilities.ts';

const shutdown = createShutdownSignal({ forceOnRepeat: true });
try {
  const archive = await packPackage(resolve(packageRoot, '.release'), shutdown.signal);
  await verifyPackedConsumer(archive, shutdown.signal);
  const manifest = await writeReleaseManifest(archive, shutdown.signal);
  if (shutdown.receivedSignal()) process.exitCode = shutdown.exitCode() ?? 1;
  else
    console.info(
      JSON.stringify({
        schemaVersion: 1,
        archive,
        version: manifest.version,
        sourceCommit: manifest.sourceCommit,
        sourceDirty: manifest.sourceDirty,
        sha256: manifest.sha256,
        published: false,
      }),
    );
} catch (cause) {
  if (shutdown.receivedSignal()) process.exitCode = shutdown.exitCode() ?? 1;
  else throw cause;
} finally {
  shutdown.dispose();
}
