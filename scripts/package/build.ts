import assert from 'node:assert/strict';
import { chmod, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { isPathWithin } from 'jg-fs';
import { createShutdownSignal, runProcess } from 'jg-process';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'dist');
assert.ok(isPathWithin(root, output));
assert.notEqual(output, root);
await rm(output, { recursive: true, force: true });
const require = createRequire(import.meta.url);
const shutdown = createShutdownSignal({ forceOnRepeat: true });
try {
  const result = await runProcess({
    command: process.execPath,
    args: [require.resolve('typescript/bin/tsc'), '-p', resolve(root, 'tsconfig.build.json')],
    cwd: root,
    timeoutSeconds: 60,
    maxOutputBytes: 1024 * 1024,
    signal: shutdown.signal,
  });
  if (shutdown.receivedSignal()) process.exitCode = shutdown.exitCode() ?? 1;
  else {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.exitCode !== 0) process.exitCode = 1;
    else await chmod(resolve(output, 'cli/cli.js'), 0o755);
  }
} catch (cause) {
  if (shutdown.receivedSignal()) process.exitCode = shutdown.exitCode() ?? 1;
  else throw cause;
} finally {
  shutdown.dispose();
}
