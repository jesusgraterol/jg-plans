import { gzipSync } from 'node:zlib';
import { Header, Pax } from 'tar';
import { describe, expect, it } from 'vitest';

import { ARCHIVE_LIMITS, inspectPackageArchive } from './archive.ts';

const block = (path: string, body = 'hello', type: 'File' | 'SymbolicLink' = 'File'): Buffer => {
  const bytes = Buffer.from(body);
  const header = new Header({
    path,
    type,
    size: bytes.byteLength,
    mode: 0o644,
    linkpath: type === 'SymbolicLink' ? '/elsewhere' : '',
  });
  header.encode();
  return Buffer.concat([
    header.block!,
    bytes,
    Buffer.alloc((512 - (bytes.byteLength % 512)) % 512),
  ]);
};
const archive = (...blocks: Buffer[]): Buffer =>
  gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));

describe('bounded package payload verification', () => {
  it('reads exact names and bytes without extracting files', async () => {
    const result = await inspectPackageArchive(archive(block('package/README.md', 'café 😀')));
    expect([...result.keys()]).toEqual(['README.md']);
    expect(result.get('README.md')).toEqual(Buffer.from('café 😀'));
  });

  it.each([
    'outside/file',
    'package/../outside',
    'package/C:/outside',
    'package/dir\\file',
    'package/./file',
  ])('rejects unsafe member %s', async (path) => {
    await expect(inspectPackageArchive(archive(block(path)))).rejects.toThrow();
  });

  it('rejects symbolic links, duplicate members, nested compression, and truncated data', async () => {
    await expect(
      inspectPackageArchive(archive(block('package/link', '', 'SymbolicLink'))),
    ).rejects.toThrow();
    await expect(
      inspectPackageArchive(archive(block('package/a'), block('package/a'))),
    ).rejects.toThrow('Duplicate');
    await expect(inspectPackageArchive(gzipSync(archive(block('package/a'))))).rejects.toThrow(
      'Nested gzip',
    );
    await expect(
      inspectPackageArchive(gzipSync(block('package/a').subarray(0, 513))),
    ).rejects.toThrow();
  });

  it('validates effective PAX paths before platform normalization', async () => {
    const valid = new Pax({ path: 'package/café/metadata.md' }).encode()!;
    expect([
      ...(await inspectPackageArchive(archive(valid, block('package/placeholder')))).keys(),
    ]).toEqual(['café/metadata.md']);
    const invalid = new Pax({ path: 'package/dir\\file' }).encode()!;
    await expect(
      inspectPackageArchive(archive(invalid, block('package/placeholder'))),
    ).rejects.toThrow();
  });

  it('bounds compressed bytes, expanded bytes, each entry, and entry count', async () => {
    await expect(
      inspectPackageArchive(Buffer.alloc(ARCHIVE_LIMITS.compressedBytes + 1)),
    ).rejects.toThrow('Compressed');
    await expect(
      inspectPackageArchive(gzipSync(Buffer.alloc(ARCHIVE_LIMITS.expandedBytes + 1))),
    ).rejects.toThrow();
    await expect(
      inspectPackageArchive(
        archive(block('package/large', 'x'.repeat(ARCHIVE_LIMITS.entryBytes + 1))),
      ),
    ).rejects.toThrow('entry exceeds');
    await expect(
      inspectPackageArchive(
        archive(
          ...Array.from({ length: ARCHIVE_LIMITS.entries + 1 }, (_, index) =>
            block(`package/${index}`, ''),
          ),
        ),
      ),
    ).rejects.toThrow('Too many');
  });
});
