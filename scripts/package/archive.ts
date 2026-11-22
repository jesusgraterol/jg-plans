import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { inspectNpmTarball } from 'jg-package-check';
import { Parser } from 'tar';

// Package verification bounds, independent of protocol/document size policy.
export const ARCHIVE_LIMITS = {
  compressedBytes: 8 * 1024 * 1024,
  expandedBytes: 16 * 1024 * 1024,
  entryBytes: 1024 * 1024,
  entries: 4096,
};

const TAR_BLOCK_BYTES = 512;
// eslint-disable-next-line no-control-regex -- control bytes are unsafe in archive paths
const UNSAFE_COMPONENT = /[\u0000-\u001f\u007f<>:"\\|?*]|[ .]$/u;
const RESERVED_COMPONENT = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu;

type IArchivePath = { name: string; children?: Map<string, IArchivePath> };

/**
 * Registers files and implicit directories under the shared parser's portable path rules.
 * @param path The effective path relative to package/.
 * @param root The archive's top-level file and directory names.
 */
const registerPath = (path: string, root: Map<string, IArchivePath>): void => {
  let siblings = root;
  const components = path.split('/');
  for (const [index, name] of components.entries()) {
    assert.ok(
      name && !UNSAFE_COMPONENT.test(name) && !RESERVED_COMPONENT.test(name),
      'Unsafe package entry path',
    );
    const key = name.normalize('NFC').toLowerCase();
    const existing = siblings.get(key);
    if (index === components.length - 1) {
      assert.ok(!existing, 'Colliding package entry path');
      siblings.set(key, { name });
    } else if (existing) {
      assert.ok(existing.name === name && existing.children, 'Colliding package entry path');
      siblings = existing.children;
    } else {
      const children = new Map<string, IArchivePath>();
      siblings.set(key, { name, children });
      siblings = children;
    }
  }
};

/**
 * Retains support for verified Unicode and long paths carried in PAX entry metadata.
 * @returns The exact files if the archive contains a PAX path and a manifest.
 */
const inspectPaxArchive = async (
  compressed: Uint8Array,
): Promise<Map<string, Buffer> | undefined> => {
  assert.ok(
    compressed.byteLength <= ARCHIVE_LIMITS.compressedBytes,
    'Compressed package exceeds verification limit',
  );
  const expanded = gunzipSync(compressed, { maxOutputLength: ARCHIVE_LIMITS.expandedBytes });
  assert.ok(
    !(expanded[0] === 0x1f && expanded[1] === 0x8b),
    'Nested gzip is not a package tar payload',
  );
  assert.ok(expanded.byteLength % TAR_BLOCK_BYTES === 0, 'Incomplete tar block');
  return new Promise((resolve, reject) => {
    const files = new Map<string, Buffer>();
    const paths = new Map<string, IArchivePath>();
    let entries = 0;
    let hasPaxPath = false;
    let hasFirstEndBlock = false;
    let failed = false;
    let failure: unknown;
    const fail = (cause: unknown): void => {
      if (!failed) {
        failed = true;
        failure = cause;
      }
    };
    const parser = new Parser({ strict: true, brotli: false, zstd: false });
    parser.on('error', (cause: Error) => {
      fail(cause);
      reject(cause);
    });
    parser.on('ignoredEntry', () => fail(new Error('Unsupported tar entry')));
    parser.on('nullBlock', () => {
      hasFirstEndBlock = true;
    });
    parser.on('end', () => {
      if (failed) reject(failure);
      else resolve(hasPaxPath && files.has('package.json') ? files : undefined);
    });
    parser.on('entry', (entry) => {
      if (failed) {
        entry.resume();
        return;
      }
      try {
        assert.equal(entry.type, 'File', 'Package entries must be regular files');
        hasPaxPath ||=
          entry.extended?.path !== undefined || entry.globalExtended?.path !== undefined;
        // ReadEntry normalizes backslashes on Windows; validate before that information is lost.
        assert.equal(entry.header.path, entry.path, 'Package entry path was normalized');
        assert.ok(entry.path.startsWith('package/'), 'Package entry is outside package/');
        const name: string = entry.path.slice('package/'.length);
        entries += 1;
        assert.ok(entries <= ARCHIVE_LIMITS.entries, 'Too many package entries');
        registerPath(name, paths);
        assert.ok(
          Number.isSafeInteger(entry.size) &&
            entry.size >= 0 &&
            entry.size <= ARCHIVE_LIMITS.entryBytes,
          'Package entry exceeds verification limit',
        );
        const chunks: Buffer[] = [];
        let bytes = 0;
        entry.on('data', (chunk: Buffer) => {
          if (failed) return;
          bytes += chunk.byteLength;
          try {
            assert.ok(
              bytes <= ARCHIVE_LIMITS.entryBytes,
              'Package entry exceeds verification limit',
            );
            chunks.push(chunk);
          } catch (cause) {
            fail(cause);
          }
        });
        entry.on('end', () => {
          if (!failed) files.set(name, Buffer.concat(chunks, bytes));
        });
      } catch (cause) {
        fail(cause);
      }
      entry.resume();
    });
    // Locate the first zero header without treating zero-filled file content as padding.
    let offset = 0;
    while (!failed && !hasFirstEndBlock && offset < expanded.byteLength) {
      const nextOffset = offset + TAR_BLOCK_BYTES;
      parser.write(expanded.subarray(offset, nextOffset));
      offset = nextOffset;
    }
    const padding = expanded.subarray(offset);
    if (
      !hasFirstEndBlock ||
      padding.byteLength < TAR_BLOCK_BYTES ||
      padding.some((byte) => byte !== 0)
    ) {
      fail(new Error('Clean tar end blocks are missing'));
    }
    parser.end();
  });
};

/**
 * Checks npm archives within jg-plans' existing byte and file limits, including legacy PAX paths.
 * @returns The exact package files without extracting them.
 * @throws
 * - INVALID_NPM_TARBALL: The npm tarball is invalid.
 */
export const inspectPackageArchive = async (
  compressed: Uint8Array,
): Promise<Map<string, Buffer>> => {
  try {
    return await inspectNpmTarball(compressed, ARCHIVE_LIMITS);
  } catch (error) {
    const compatible = await inspectPaxArchive(compressed).catch(() => undefined);
    if (compatible !== undefined) return compatible;
    throw error;
  }
};
