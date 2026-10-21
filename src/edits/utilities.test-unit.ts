import { expectToThrowCode } from 'jg-exception/testing';
import { ERRORS } from 'jg-plans';
import { describe, expect, it } from 'vitest';

import { applyEdits } from './utilities.ts';

describe('original-byte source spans', () => {
  it('maps UTF-16 positions past BOM and supplementary Unicode to original UTF-8 bytes', () => {
    const source = '\uFEFFé😀 pending\r\n';
    const result = applyEdits(Buffer.from(source), source, [
      { start: 5, end: 12, replacement: 'done' },
    ]);
    expect(result).toEqual(Buffer.from('\uFEFFé😀 done\r\n'));
  });

  it('rejects overlaps, repeated insertion points, and boundaries inside a surrogate pair', () => {
    const source = '\uFEFFé😀 pending\r\n';
    for (const edits of [
      [
        { start: 5, end: 10, replacement: 'x' },
        { start: 9, end: 12, replacement: 'y' },
      ],
      [
        { start: 5, end: 5, replacement: 'x' },
        { start: 5, end: 5, replacement: 'y' },
      ],
      [{ start: 3, end: 4, replacement: 'x' }],
      [{ start: -1, end: 0, replacement: 'x' }],
    ])
      expectToThrowCode(() => applyEdits(Buffer.from(source), source, edits), ERRORS.UNSAFE_EDIT);
  });

  it('rejects replacement text UTF-8 would silently repair', () => {
    expectToThrowCode(
      () => applyEdits(Buffer.from('x'), 'x', [{ start: 0, end: 1, replacement: '\uD800' }]),
      ERRORS.UNSUPPORTED_ENCODING,
    );
  });
});
