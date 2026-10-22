import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readBoundedFile } from 'jg-fs';
import { resolvePackageManagerCommand, runProcess } from 'jg-process';
import { z } from 'zod';

export const packageRoot = resolve(import.meta.dirname, '../..');

/** Pack the already built root, never a website workspace or a newly rebuilt alternative. */
export const packPackage = async (destination: string, signal?: AbortSignal): Promise<string> => {
  const raw: unknown = JSON.parse(
    (await readBoundedFile(resolve(packageRoot, 'package.json'), 1024 * 1024)).toString('utf8'),
  );
  const manifest = z
    .object({ name: z.literal('jg-plans'), version: z.string().regex(/^\d+\.\d+\.\d+$/) })
    .parse(raw);
  await mkdir(destination, { recursive: true });
  const command = resolvePackageManagerCommand(
    ['pack', '--pack-destination', destination, '--json'],
    { packageManager: 'pnpm', cwd: packageRoot },
  );
  const result = await runProcess({
    ...command,
    cwd: packageRoot,
    timeoutSeconds: 60,
    maxOutputBytes: 1024 * 1024,
    ...(signal ? { signal } : {}),
  });
  assert.equal(result.exitCode, 0, result.stderr);
  const archive = resolve(destination, `${manifest.name}-${manifest.version}.tgz`);
  await readBoundedFile(archive, 8 * 1024 * 1024);
  return archive;
};
