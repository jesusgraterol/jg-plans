import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { Parser } from 'tar';

// Package verification bounds, independent of protocol/document size policy.
export const ARCHIVE_LIMITS = {
  compressedBytes: 8 * 1024 * 1024,
  expandedBytes: 16 * 1024 * 1024,
  entryBytes: 1024 * 1024,
  entries: 4096,
};

/** Inspect a gzip tar payload without extraction; reject unsafe paths, links, and duplicate entries. */
export const inspectPackageArchive = async (
  compressed: Uint8Array,
): Promise<Map<string, Buffer>> => {
  assert.ok(
    compressed.byteLength <= ARCHIVE_LIMITS.compressedBytes,
    'Compressed package exceeds verification limit',
  );
  const expanded = gunzipSync(compressed, { maxOutputLength: ARCHIVE_LIMITS.expandedBytes });
  assert.ok(
    !(expanded[0] === 0x1f && expanded[1] === 0x8b),
    'Nested gzip is not a package tar payload',
  );
  return new Promise((resolve, reject) => {
    const files = new Map<string, Buffer>();
    const seen = new Set<string>();
    let failed = false;
    let failure: unknown;
    const fail = (cause: unknown): void => {
      if (!failed) {
        failed = true;
        failure = cause;
      }
    };
    const parser = new Parser({ strict: true, brotli: false, zstd: false });
    parser.on('error', reject);
    parser.on('end', () => (failed ? reject(failure) : resolve(files)));
    parser.on('entry', (entry) => {
      if (failed) {
        entry.resume();
        return;
      }
      try {
        assert.equal(entry.type, 'File', 'Package entries must be regular files');
        // ReadEntry normalizes backslashes on Windows; validate before that information is lost.
        assert.equal(entry.header.path, entry.path, 'Package entry path was normalized');
        assert.ok(entry.path.startsWith('package/'), 'Package entry is outside package/');
        const name: string = entry.path.slice('package/'.length);
        assert.ok(
          name &&
            !name.includes('\\') &&
            !name.includes('\0') &&
            !name.includes(':') &&
            !name.split('/').some((part) => !part || part === '.' || part === '..'),
          'Unsafe package entry path',
        );
        assert.ok(!seen.has(name), 'Duplicate package entry');
        seen.add(name);
        assert.ok(seen.size <= ARCHIVE_LIMITS.entries, 'Too many package entries');
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
    parser.end(expanded);
  });
};
