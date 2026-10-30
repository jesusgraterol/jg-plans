import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePlan, parseMilestones, fingerprintPlan, inspectPlan, checkPlan } from 'jg-plans';
import { describe, expect, test } from 'vitest';

import { buildLifecycle } from './index.ts';

const plan = await readFile(new URL('../../../examples/criteria/plan.md', import.meta.url), 'utf8');
const milestones = await readFile(
  new URL('../../../examples/criteria/milestones.md', import.meta.url),
  'utf8',
);

describe('public lifecycle demonstration', { tags: ['full'] }, () => {
  test('the lifecycle uses real guarded operations and retains optional absence, IDs and exact milestone bytes across a revision', async () => {
    const result = await buildLifecycle(plan, milestones);
    expect(result.stages.map((stage) => stage.id)).toEqual([
      'create',
      'inspect',
      'update',
      'revise',
    ]);
    expect(result.stages[0]!.consumer).toEqual({
      plan: 'readable',
      milestones: 'missing',
      revision: 1,
      status: 'pending',
      criteria: ['AC-01', 'AC-02', 'AC-03'],
    });
    expect(parsePlan(result.before).metadata).toMatchObject({
      revision: 1,
      status: 'in progress',
      protocol: '0.2',
    });
    expect(parsePlan(result.after).metadata).toMatchObject({ revision: 2, status: 'in progress' });
    expect(parsePlan(result.after).body).toBe(
      parsePlan(result.before).body + '- AC-04: Search suggests spelling corrections.\n',
    );
    expect(result.unchangedMilestones).toContain(milestones);
    expect(result.retained).toEqual([
      {
        id: '3c7a2f1e-9b4d-4e8a-a6f2-1d5c7e9b0a34',
        title: 'Explain empty results',
        status: 'done',
      },
      {
        id: '8e1d6b2a-4f7c-4a3e-b9d1-6c2e8f4a7b15',
        title: 'Offer a next action',
        status: 'in progress',
      },
    ]);
    // a criterion is done when every milestone delivering it is done, and in progress once one starts
    expect(result.progress).toEqual([
      { id: 'AC-01', milestones: [1], progress: 'done' },
      { id: 'AC-02', milestones: [2], progress: 'in progress' },
      { id: 'AC-03', milestones: [2], progress: 'in progress' },
    ]);
    // seventeen frontmatter lines (six core keys, the example's priority, its repositories and error
    // codes written as block lists, and two delimiters), then AC-04 on the body's tenth line
    expect(result.finding).toEqual({ code: 'UNASSIGNED_CRITERION', criterion: 'AC-04', line: 27 });
    expect(result.stages[3]!.consumer).toMatchObject({
      binding: 'stale',
      check: { conforms: false, findings: [result.finding] },
    });
    expect(result.staleWrite.code).toBe('JG_PLANS_SOURCE_CHANGED');
    expect(result.staleWrite.expectedSha256).not.toBe(result.staleWrite.currentSha256);
    expect(parseMilestones(result.unchangedMilestones).rawMetadata).toEqual({
      jg_skills: {
        plan_id: '1792612920_search-feedback-criteria',
        plan_revision: 1,
        plan_content_sha256: result.binding.before,
      },
    });
    expect(result.binding.after).not.toBe(result.binding.before);
    const reprioritized = result.before.replace('\npriority: medium\n', '\npriority: high\n');
    expect(reprioritized).not.toBe(result.before);
    expect(
      fingerprintPlan(reprioritized, {
        excludeMetadataKeys: ['created_at', 'updated_at', 'revision', 'status', 'priority'],
      }).sha256,
    ).toBe(result.binding.before);
    // The default engine excludes nothing; this consumer explicitly chooses its administrative keys.
    expect(fingerprintPlan(result.before).sha256).not.toBe(result.binding.before);
  });

  test('every stage retains the complete named API result with only disclosed path substitutions', async () => {
    const result = await buildLifecycle(plan, milestones);
    const root = await mkdtemp(join(tmpdir(), 'jg-plans-full-results-'));
    try {
      for (const stage of result.stages) {
        if (stage.id === 'create') {
          expect(stage.call).toBe('createPlan(options)');
          expect(stage.result).toStrictEqual({
            directory: 'jg-plans/search-feedback',
            plan: {
              ...parsePlan(stage.source),
              sha256: createHash('sha256').update(stage.source).digest('hex'),
            },
            milestones: null,
            diagnostics: [],
          });
        } else {
          const directory = join(root, stage.id);
          await mkdir(directory);
          await writeFile(join(directory, 'plan.md'), stage.source);
          if (stage.id !== 'inspect')
            await writeFile(join(directory, 'milestones.md'), result.unchangedMilestones);
          const actual = await inspectPlan(directory);
          expect(stage.call).toBe('inspectPlan(directory)');
          expect(stage.result).toStrictEqual({
            ...actual,
            directory: 'jg-plans/search-feedback',
            plan: { ...actual.plan, path: 'jg-plans/search-feedback/plan.md' },
            milestones: { ...actual.milestones, path: 'jg-plans/search-feedback/milestones.md' },
          });
        }
      }
      expect(
        result.stages.map(({ operations }) => operations.map(({ call }) => call)),
      ).toStrictEqual([
        [],
        [],
        ['updatePlan(directory, patch)', 'writePlanDocument(directory, input)'],
        ['writePlanDocument(directory, input)', 'checkPlan(documents)'],
      ]);
      expect(result.stages[3]!.operations[1]!.result).toStrictEqual(
        checkPlan({ plan: result.after, milestones: result.unchangedMilestones }),
      );
      for (const stage of result.stages)
        for (const operation of stage.operations)
          if ('directory' in operation.result) {
            expect(operation.result.directory).toBe('jg-plans/search-feedback');
            expect(operation.result).toMatchObject({
              changed: true,
              assignedMilestoneIds: [],
              diagnostics: [],
            });
          }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('repeated real filesystem runs produce the same public demonstration without leaking temporary paths', async () => {
    const first = await buildLifecycle(plan, milestones);
    const second = await buildLifecycle(plan, milestones);
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(/jg-plans-showcase-|\/home\/|\/tmp\//u);
  });
});
