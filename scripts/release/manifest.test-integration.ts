import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expectToRejectCode } from 'jg-exception/testing';
import { readBoundedFile } from 'jg-fs';
import { resolvePackageManagerCommand, runProcess } from 'jg-process';
import { expect, it } from 'vitest';

import {
  ARCHIVE_LIMITS,
  inspectPackageArchive,
  packageRoot,
  packPackage,
} from '../package/index.ts';

import { payloadHashes, readRelease, samePayload, writeReleaseManifest } from './manifest.ts';

it(
  'runs the release entry point with source checks and a disabled publication gate',
  { timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jg-plans-release-cli-'));
    try {
      const archive = await packPackage(directory);
      const receipt = await writeReleaseManifest(archive);
      await writeFile(
        join(directory, 'release-manifest.json'),
        JSON.stringify({ ...receipt, sourceDirty: false }),
      );
      const env = {
        ...process.env,
        CI: 'true',
        GITHUB_SHA: receipt.sourceCommit,
        GITHUB_REF: 'refs/heads/main',
        GITHUB_REPOSITORY: 'jesusgraterol/jg-plans',
        NPM_TRUSTED_PUBLISHING_READY: '',
      };
      const run = (extra: Record<string, string>, command = 'publish') =>
        runProcess({
          command: process.execPath,
          args: [join(packageRoot, 'scripts/release/release.ts'), command, '--from', directory],
          cwd: packageRoot,
          env: { ...env, ...extra },
          timeoutSeconds: 30,
          maxOutputBytes: 1024 * 1024,
        });
      const disabled = await run({});
      expect(disabled.exitCode).toBe(0);
      expect(disabled.stderr).toBe('');
      expect(JSON.parse(disabled.stdout)).toEqual({ state: 'disabled', version: receipt.version });
      const stale = await run({ GITHUB_SHA: '0'.repeat(40) });
      expect(stale.exitCode).toBe(1);
      expect(stale.stderr).toContain('RELEASE_SOURCE_MISMATCH');
      const branch = await run({ GITHUB_REF: 'refs/heads/development' });
      expect(branch.exitCode).toBe(1);
      expect(branch.stderr).toContain('RELEASE_SOURCE_MISMATCH');
      const missingManager = await run({ PATH: '', Path: '', npm_execpath: '' }, 'consumer');
      expect(missingManager.exitCode).toBe(1);
      expect(missingManager.stdout).toBe('');
      expect(missingManager.stderr).toContain('PACKAGE_MANAGER_NOT_FOUND');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it(
  'records and validates the exact archive, rejecting altered bytes, file receipts and unsafe archive names',
  { timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jg-plans-receipt-'));
    try {
      const archive = await packPackage(directory);
      const receipt = await writeReleaseManifest(archive);
      expect((await readRelease(directory)).manifest).toEqual(receipt);
      const bytes = await readFile(archive);
      await writeFile(archive, Buffer.concat([bytes, Buffer.from('changed')]));
      await expectToRejectCode(
        readRelease(directory),
        'RELEASE_INTEGRITY_MISMATCH',
        'Release archive integrity does not match',
      );
      await writeFile(archive, bytes);
      const file = join(directory, 'release-manifest.json');
      await writeFile(
        file,
        JSON.stringify({ ...receipt, files: { ...receipt.files, 'README.md': '0'.repeat(64) } }),
      );
      await expectToRejectCode(readRelease(directory), 'RELEASE_INTEGRITY_MISMATCH');
      await writeFile(file, JSON.stringify({ ...receipt, archive: '../outside.tgz' }));
      await expectToRejectCode(
        readRelease(directory),
        'RELEASE_INVALID_INPUT',
        'Invalid release input',
      );
      await writeFile(file, '{ malformed receipt');
      await expectToRejectCode(readRelease(directory), 'RELEASE_INVALID_INPUT');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it(
  'makes shipped docs/examples change identity while private website changes do not',
  { timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jg-plans-identity-'));
    try {
      const baseline = await packPackage(join(directory, 'baseline'));
      const bytes = await readBoundedFile(baseline, ARCHIVE_LIMITS.compressedBytes);
      const payload = await inspectPackageArchive(bytes);
      const root = join(directory, 'source');
      for (const [name, content] of payload) {
        const path = join(root, name);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content);
      }
      await mkdir(join(root, 'website'), { recursive: true });
      await writeFile(join(root, 'website', 'private.md'), 'Private website-only change');
      const repack = async (destination: string) => {
        await mkdir(destination);
        const result = await runProcess({
          ...resolvePackageManagerCommand(['pack', '--pack-destination', destination, '--json'], {
            packageManager: 'pnpm',
            cwd: root,
          }),
          cwd: root,
          timeoutSeconds: 30,
          maxOutputBytes: 1024 * 1024,
        });
        expect(result.exitCode).toBe(0);
        const name = (await writeReleaseManifest(baseline)).version;
        return payloadHashes(
          await readBoundedFile(
            join(destination, `jg-plans-${name}.tgz`),
            ARCHIVE_LIMITS.compressedBytes,
          ),
        );
      };
      const hashes = await payloadHashes(bytes);
      expect(samePayload(hashes, await repack(join(directory, 'website-only')))).toBe(true);
      await writeFile(join(root, 'README.md'), 'Changed packaged documentation');
      await writeFile(join(root, 'examples', 'library.mjs'), '// Changed packaged example\n');
      const changed = await repack(join(directory, 'shipped-change'));
      expect(samePayload(hashes, changed)).toBe(false);
      expect(changed['README.md']).not.toBe(hashes['README.md']);
      expect(changed['examples/library.mjs']).not.toBe(hashes['examples/library.mjs']);
      expect(Object.keys(changed).some((path) => path.startsWith('website/'))).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
