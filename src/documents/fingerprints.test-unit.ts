import { createHash } from 'node:crypto';
import { expectToThrowCode } from 'jg-exception/testing';
import {
  ERRORS,
  fingerprintPlan,
  parsePlan,
  PlanFingerprintOptionsSchema,
  PlanFingerprintSchema,
  InspectPlanOptionsSchema,
} from 'jg-plans';
import { describe, expect, it } from 'vitest';

const administrative = ['created_at', 'updated_at', 'revision', 'status'];
const source =
  '---\nid: invented\ncreated_at: 2026-10-21T20:00:00Z\nupdated_at: 2026-10-21T20:00:00Z\nrevision: 1\nstatus: pending\nscope: {paths: [src], owner: example}\n---\n# Work 😀\n';

describe('built structural fingerprints', () => {
  it(
    'validates the actual available/unavailable JSON results through the public result schema',
    { tags: ['full'] },
    () => {
      expect(PlanFingerprintSchema.safeParse(fingerprintPlan(source)).success).toBe(true);
      expect(PlanFingerprintSchema.safeParse(fingerprintPlan('---\nunterminated')).success).toBe(
        true,
      );
      expect(
        PlanFingerprintSchema.safeParse({ sha256: null, excludeMetadataKeys: [], diagnostics: [] })
          .success,
      ).toBe(false);
      expect(
        PlanFingerprintSchema.safeParse({
          ...fingerprintPlan(source),
          excludeMetadataKeys: ['status', 'status'],
        }).success,
      ).toBe(false);
      expect(
        PlanFingerprintSchema.safeParse({ ...fingerprintPlan(source), sha256: 'not-a-hash' })
          .success,
      ).toBe(false);
    },
  );

  it('hashes independently specified deterministic JSON without requiring metadata conformance', () => {
    const expected = createHash('sha256')
      .update('{"body":"# Work\\n","metadata":{}}')
      .digest('hex');
    expect(fingerprintPlan('# Work\n')).toEqual({
      sha256: expected,
      excludeMetadataKeys: [],
      diagnostics: [],
    });
    expect(fingerprintPlan('')).toMatchObject({ sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(fingerprintPlan('---\nrevision: custom\n---\n# Work').sha256).not.toBeNull();
  });

  it('ignores metadata key order and YAML presentation while covering all keys by default', () => {
    const one = '---\nid: sample\nextension: {b: 2, a: 1}\n---\n# Work';
    const reordered =
      '---\n# presentation only\nextension:\n  a: 1\n  b: 2\nid: "sample"\n---\n# Work';
    expect(fingerprintPlan(one).sha256).toBe(fingerprintPlan(reordered).sha256);
    expect(fingerprintPlan(one.replace('id: sample', 'id: changed')).sha256).not.toBe(
      fingerprintPlan(one).sha256,
    );
    expect(fingerprintPlan(one.replace('b: 2', 'b: 3')).sha256).not.toBe(
      fingerprintPlan(one).sha256,
    );
  });

  it('excludes only requested unique top-level keys and retains nested names and identity', () => {
    const options = { excludeMetadataKeys: [...administrative, 'status'] };
    const result = fingerprintPlan(source, options);
    expect(result.excludeMetadataKeys).toEqual(administrative);
    expect(options.excludeMetadataKeys).toHaveLength(5);
    const edited = source
      .replace('revision: 1', 'revision: 9')
      .replace('status: pending', 'status: done')
      .replaceAll('2026-10-21', '2026-10-22');
    expect(fingerprintPlan(edited, options).sha256).toBe(result.sha256);
    expect(fingerprintPlan(edited).sha256).not.toBe(fingerprintPlan(source).sha256);
    for (const edit of [
      source.replace('id: invented', 'id: other'),
      source.replace('owner: example', 'owner: other'),
      source.replace('# Work', '# More work'),
    ])
      expect(fingerprintPlan(edit, options).sha256).not.toBe(result.sha256);
    const nested = '---\nstatus: pending\nproject: {status: pending}\n---\n# Work';
    expect(fingerprintPlan(nested, { excludeMetadataKeys: ['status'] }).sha256).not.toBe(
      fingerprintPlan(nested.replace('project: {status: pending}', 'project: {status: done}'), {
        excludeMetadataKeys: ['status'],
      }).sha256,
    );
    expect(
      fingerprintPlan(source, { excludeMetadataKeys: [...administrative].reverse() }).sha256,
    ).toBe(result.sha256);
  });

  it('retains exact body text, Unicode, and line endings without treating the BOM as metadata', () => {
    expect(fingerprintPlan('\uFEFF' + source).sha256).toBe(fingerprintPlan(source).sha256);
    expect(fingerprintPlan(source.replaceAll('\n', '\r\n')).sha256).not.toBe(
      fingerprintPlan(source).sha256,
    );
    expect(fingerprintPlan(source.replace('# Work 😀\n', '# Work 😀')).sha256).not.toBe(
      fingerprintPlan(source).sha256,
    );
    expect(fingerprintPlan('\uFEFF# Work').sha256).not.toBe(fingerprintPlan('# Work').sha256);
  });

  it.each([
    '---\nid: missing-close',
    '---\nid: [broken\n---\n# Work',
    '---\nid: first\nid: second\n---\n# Work',
    '---\n- not\n- mapping\n---\n# Work',
    '---\nnull\n---\n# Work',
    '---\nextension: &cycle [*cycle]\n---\n# Work',
    '---\nextension: .inf\n---\n# Work',
    '---\nextension: 9007199254740993\n---\n# Work',
    '---\nextension: !!set {a, b}\n---\n# Work',
    '---\nextension: !unknown value\n---\n# Work',
    '---\n? [a, b]\n: value\n---\n# Work',
    '---\nproject: {true: value}\n---\n# Work',
    '---\nbase: &key name\n? *key\n: value\n---\n# Work',
  ])(
    'reports an unavailable fingerprint while preserving observations: %j',
    { tags: ['full'] },
    (value) => {
      const result = fingerprintPlan(value, { excludeMetadataKeys: ['extension'] });
      expect(result.sha256).toBeNull();
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(parsePlan(value).source).toBe(value);
      expect(JSON.stringify(result)).not.toContain(value);
    },
  );

  it(
    'hashes expanded nonrecursive aliases and integer-like keys deterministically',
    { tags: ['full'] },
    () => {
      const one = '---\nbase: &value {"10": ten, "9": nine}\nother: *value\n---\n# Work';
      const two = '---\nother: {"9": nine, "10": ten}\nbase: {"9": nine, "10": ten}\n---\n# Work';
      const result = fingerprintPlan(one);
      expect(result.sha256).not.toBeNull();
      expect(result.sha256).toBe(fingerprintPlan(two).sha256);
    },
  );

  it('validates closed public options and never silently accepts an exclusion typo', () => {
    expect(
      PlanFingerprintOptionsSchema.safeParse({ excludeMetadataKeys: ['status'] }).success,
    ).toBe(true);
    expect(InspectPlanOptionsSchema.safeParse({ fingerprint: {} }).success).toBe(true);
    for (const options of [
      null,
      { exclude: ['status'] },
      { excludeMetadataKeys: [1] },
      { excludeMetadataKeys: 'status' },
    ])
      expectToThrowCode(() => fingerprintPlan(source, options as never), ERRORS.INVALID_INPUT);
    expectToThrowCode(() => fingerprintPlan(null as never), ERRORS.INVALID_INPUT);
  });
});
