import { resolve } from 'node:path';
import { createShutdownSignal } from 'jg-process';

import { verifyPackedConsumer } from './consumer.ts';
import { packageRoot, packPackage } from './utilities.ts';

const shutdown = createShutdownSignal({ forceOnRepeat: true });
try {
  const archive = await packPackage(resolve(packageRoot, '.release'), shutdown.signal);
  await verifyPackedConsumer(archive, shutdown.signal);
  if (shutdown.receivedSignal()) process.exitCode = shutdown.exitCode() ?? 1;
  else console.info(JSON.stringify({ schemaVersion: 1, archive, published: false }));
} catch (cause) {
  if (shutdown.receivedSignal()) process.exitCode = shutdown.exitCode() ?? 1;
  else throw cause;
} finally {
  shutdown.dispose();
}
