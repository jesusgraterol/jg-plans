import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  checkPlan,
  createPlan,
  DeliveryMetadataSchema,
  DeliverySchema,
  ERRORS,
  fingerprintPlan,
  inspectPlan,
  observeCriteria,
  parseMilestones,
  parsePlan,
  PlanStatusSchema,
  ProgressSchema,
  updatePlan,
  writePlanDocument,
} from 'jg-plans';
import { runProcess } from 'jg-process';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
const fixture = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'jg-plans-delivery-'));
  roots.push(directory);
  return directory;
};
const source = (
  fields = 'repositories: [acme/app]\ndelivery: {acme/app: development}',
  eol = '\n',
): string =>
  [
    '\uFEFF---',
    'id: delivery # identity',
    'created_at: 2026-11-09T12:00:00Z',
    'updated_at: 2026-11-09T12:00:00Z',
    'revision: 3',
    'status: delivered # progress',
    fields,
    'extension: { label: café }',
    '---',
    '# Task 😀',
    '- AC-01: Complete work.',
  ].join(eol);
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('required native delivery', () => {
  it.each([
    {},
    { delivery: null },
    { delivery: [] },
    { delivery: { 'acme/app': '' } },
    { delivery: { 'acme/app': '  ' } },
    { delivery: { 'acme/app': 3 } },
    { repositories: ['acme/app'], delivery: {} },
    { repositories: ['acme/app'], delivery: { 'acme/api': 'main' } },
    { repositories: ['acme/app'], delivery: { 'acme/app': 'main', 'ACME/App': 'main' } },
    { delivery: { 'acme/app': 'main' } },
  ])('rejects invalid creation before filesystem mutation: %j', async (metadata) => {
    const root = await fixture();
    await expect(
      createPlan({ root, slug: 'invalid', body: '# Work', metadata }),
    ).rejects.toMatchObject({ code: ERRORS.INVALID_INPUT });
    expect(await readdir(root)).toEqual([]);
  });

  it('requires metadata at the public creation boundary', async () => {
    const root = await fixture();
    // @ts-expect-error Delivery metadata is required for every creation.
    await expect(createPlan({ root, slug: 'invalid', body: '# Work' })).rejects.toMatchObject({
      code: ERRORS.INVALID_INPUT,
    });
    expect(await readdir(root)).toEqual([]);
  });

  it('preserves stop spelling and matches repository identifiers without regard to case', async () => {
    const root = await fixture();
    const created = await createPlan({
      root,
      slug: 'case',
      body: '- AC-01: Deliver.',
      metadata: {
        repositories: ['Acme/App'],
        delivery: { 'acme/app': 'Release Candidate' },
      },
    });
    expect(created.diagnostics).toEqual([]);
    expect(created.plan.metadata.delivery).toEqual({ 'acme/app': 'Release Candidate' });
    expect(DeliverySchema.safeParse({ 'acme/app': 'main' }).success).toBe(true);
    expect(DeliveryMetadataSchema.safeParse({ delivery: {} }).success).toBe(true);
    const empty = await createPlan({
      root,
      slug: 'repository-free',
      body: '- AC-01: Observe.',
      metadata: { delivery: {} },
    });
    expect(empty.diagnostics).toEqual([]);
    expect(empty.plan.metadata.delivery).toEqual({});
  });

  it.each([
    ['repositories: [acme/app]', 'MISSING_METADATA_FIELD'],
    ['repositories: [acme/app]\ndelivery: {}', 'INVALID_DELIVERY'],
    ['delivery: null', 'INVALID_DELIVERY'],
    ['repositories: [acme/app]\ndelivery: {acme/app: main, ACME/App: main}', 'INVALID_DELIVERY'],
  ])('retains malformed raw observations: %s', async (fields, code) => {
    const text = source(fields);
    const root = await fixture();
    await writeFile(join(root, 'plan.md'), text);
    const observed = await inspectPlan(root);
    if (observed.plan.state !== 'readable') throw new Error('Expected readable plan.');
    expect(observed.plan.value.source).toBe(text);
    expect(observed.plan.value.metadata.delivery).toBeUndefined();
    expect(observed.plan.value.rawMetadata).toEqual(parsePlan(text).rawMetadata);
    expect(observed.diagnostics).toContainEqual(expect.objectContaining({ code }));
  });

  it.each(['\n', '\r\n'])(
    'updates the complete pair and preserves every unrelated byte with %j',
    async (eol) => {
      const root = await fixture();
      const text = source(
        'repositories:\n  - acme/app\ndelivery:\n  acme/app: development'.replaceAll('\n', eol),
        eol,
      );
      await writeFile(join(root, 'plan.md'), text);
      const before = await inspectPlan(root);
      if (before.plan.state !== 'readable') throw new Error('Expected readable plan.');
      const set = { repositories: ['Acme/api'], delivery: { 'acme/api': 'main' } };
      const changed = await updatePlan(root, {
        document: 'plan',
        set,
        expectedSha256: before.plan.sha256,
      });
      const expected = text
        .replace(`repositories:${eol}  - acme/app`, 'repositories: [ Acme/api ]')
        .replace(`delivery:${eol}  acme/app: development`, 'delivery: { acme/api: main }');
      expect(await readFile(join(root, 'plan.md'), 'utf8')).toBe(expected);
      expect(changed.diagnostics).toEqual([]);
      expect(
        (await updatePlan(root, { document: 'plan', set, expectedSha256: changed.sha256! }))
          .changed,
      ).toBe(false);
      await expect(
        updatePlan(root, { document: 'plan', set: { repositories: ['acme/other'] } }),
      ).rejects.toMatchObject({ code: ERRORS.INVALID_INPUT });
      await expect(
        updatePlan(root, { document: 'plan', set: { delivery: {} } }),
      ).rejects.toMatchObject({ code: ERRORS.INVALID_INPUT });
      expect(await readFile(join(root, 'plan.md'), 'utf8')).toBe(expected);
      const removed = await updatePlan(root, {
        document: 'plan',
        set: { repositories: null, delivery: {} },
      });
      const observed = await inspectPlan(root);
      if (observed.plan.state !== 'readable') throw new Error('Expected readable plan.');
      expect(observed.plan.value.metadata.delivery).toEqual({});
      expect(observed.plan.value.metadata.repositories).toBeUndefined();
      expect(removed.diagnostics).toEqual([]);
    },
  );

  it('atomically records retargeting before effects and safely retries from the recorded target', async () => {
    const root = await fixture();
    await writeFile(join(root, 'plan.md'), source());
    const initial = await inspectPlan(root);
    if (initial.plan.state !== 'readable') throw new Error('Expected readable plan.');
    const patch = {
      document: 'plan' as const,
      expectedSha256: initial.plan.sha256,
      set: {
        delivery: { 'acme/app': 'main' },
        status: 'done',
      },
    };
    const changed = await updatePlan(root, patch);
    // An interruption or blocked delivery step leaves the complete new target visibly undelivered.
    const interrupted = await inspectPlan(root);
    if (interrupted.plan.state !== 'readable') throw new Error('Expected readable plan.');
    expect(interrupted.plan.value.metadata).toMatchObject({
      status: 'done',
      delivery: { 'acme/app': 'main' },
      revision: 3,
    });
    const bytes = await readFile(join(root, 'plan.md'));
    await expect(
      updatePlan(root, {
        ...patch,
        set: { delivery: { 'acme/app': 'production' }, status: 'delivered' },
      }),
    ).rejects.toMatchObject({ code: ERRORS.SOURCE_CHANGED });
    expect(await readFile(join(root, 'plan.md'))).toEqual(bytes);
    const retried = await updatePlan(root, {
      ...patch,
      expectedSha256: changed.sha256!,
      set: patch.set,
    });
    expect(retried.changed).toBe(false);
    await updatePlan(root, {
      document: 'plan',
      expectedSha256: changed.sha256!,
      set: { status: 'delivered' },
    });
    expect(parsePlan(await readFile(join(root, 'plan.md'), 'utf8')).metadata.status).toBe(
      'delivered',
    );
  });

  it('uses the same pair validation for guarded body/metadata writes', async () => {
    const root = await fixture();
    await writeFile(join(root, 'plan.md'), source());
    const observed = await inspectPlan(root);
    if (observed.plan.state !== 'readable') throw new Error('Expected readable plan.');
    await expect(
      writePlanDocument(root, {
        document: 'plan',
        expectedSha256: observed.plan.sha256,
        body: '# Changed',
        set: { repositories: ['acme/api'] },
      }),
    ).rejects.toMatchObject({ code: ERRORS.INVALID_INPUT });
    expect(await readFile(join(root, 'plan.md'), 'utf8')).toBe(source());
    await writePlanDocument(root, {
      document: 'plan',
      expectedSha256: observed.plan.sha256,
      body: '- AC-01: Changed.',
      set: { repositories: ['acme/api'], delivery: { 'acme/api': 'main' } },
    });
  });

  it('keeps three progress values and existing bindings when adding excluded delivery', () => {
    expect(PlanStatusSchema.safeParse('delivered').success).toBe(true);
    expect(ProgressSchema.safeParse('delivered').success).toBe(false);
    const old = source('repositories: [acme/app]');
    const five = ['created_at', 'updated_at', 'revision', 'status', 'priority'];
    const six = [...five, 'delivery'];
    expect(fingerprintPlan(old, { excludeMetadataKeys: five }).sha256).toBe(
      fingerprintPlan(source(), { excludeMetadataKeys: six }).sha256,
    );
    expect(fingerprintPlan(source()).sha256).not.toBe(fingerprintPlan(old).sha256);
    const plan = parsePlan(source());
    expect(observeCriteria(plan).criteria[0]?.progress).toBe('done');
    const sequence = parseMilestones(
      '## Milestone 1: Work\n**Status:** done\n**Acceptance criteria:** AC-01',
    );
    expect(observeCriteria(plan, sequence).criteria[0]?.progress).toBe('done');
    expect(
      checkPlan({ plan: source(), milestones: '## Milestone 1: Work\n**Status:** delivered' })
        .diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'INVALID_STATUS' }));
  });

  it('enforces the installed CLI contract on creation, inspection, guarded retargeting and checks', async ({
    signal,
  }) => {
    const root = await fixture();
    const run = async (args: string[], input?: unknown) => {
      const result = await runProcess({
        command: process.execPath,
        args: [resolve('dist/cli/cli.js'), ...args, '--json'],
        ...(input === undefined ? {} : { input: JSON.stringify(input) }),
        signal,
        timeoutSeconds: 10,
        maxOutputBytes: 1024 * 1024,
      });
      expect(result.stderr).toBe('');
      const envelope = JSON.parse(result.stdout);
      expect(envelope.schemaVersion).toBe(3);
      return { result, envelope };
    };
    const created = await run(['create', '--root', root, '--slug', 'cli', '--input', '-'], {
      body: '- AC-01: Deliver.',
      metadata: { repositories: ['acme/app'], delivery: { 'acme/app': 'development' } },
    });
    expect(created.result.exitCode).toBe(0);
    const directory = created.envelope.data.directory;
    const inspected = await run(['inspect', '--directory', directory]);
    expect(inspected.envelope.data.plan.metadata.delivery).toEqual({ 'acme/app': 'development' });
    const changed = await run(['update', '--directory', directory, '--input', '-'], {
      document: 'plan',
      expectedSha256: inspected.envelope.data.plan.sha256,
      set: { delivery: { 'acme/app': 'main' }, status: 'done' },
    });
    expect(changed.result.exitCode).toBe(0);
    const checked = await run(['check', '--directory', directory]);
    expect(checked.result.exitCode).toBe(0);
    expect(checked.envelope.data.conforms).toBe(true);
  });
});
