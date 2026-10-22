import { readFile } from 'node:fs/promises';
import { parsePlan, parseMilestones, fingerprintPlan } from 'jg-plans';
import { expect, test } from 'vitest';

import { buildLifecycle } from './index.ts';

const plan = await readFile(
  new URL('../../../examples/with-milestones/plan.md', import.meta.url),
  'utf8',
);
const milestones = await readFile(
  new URL('../../../examples/with-milestones/milestones.md', import.meta.url),
  'utf8',
);

test('the lifecycle uses real guarded operations and retains optional absence, IDs and exact milestone bytes across a revision', async () => {
  const result = await buildLifecycle(plan, milestones);
  expect(result.stages.map((stage) => stage.id)).toEqual(['create', 'inspect', 'update', 'revise']);
  expect(result.stages[0]!.result).toEqual({
    plan: 'readable',
    milestones: 'missing',
    revision: 1,
    status: 'pending',
  });
  expect(parsePlan(result.before).metadata).toMatchObject({ revision: 1, status: 'in progress' });
  expect(parsePlan(result.after).metadata).toMatchObject({ revision: 2, status: 'in progress' });
  expect(parsePlan(result.after).body).toBe(
    parsePlan(result.before).body +
      '\n## Additional requirement\n\nGroup the examples by workflow.\n',
  );
  expect(result.unchangedMilestones).toContain(milestones);
  expect(result.retained).toEqual([
    { id: '5a148c73-7d38-4a2f-9c0f-903d93b9b764', title: 'Document cards', status: 'done' },
    { id: 'd7f04e92-61a7-4caf-8ab2-64c2b9f787e1', title: 'Copy and download', status: 'pending' },
  ]);
  expect(parseMilestones(result.unchangedMilestones).rawMetadata).toEqual({
    jg_skills: {
      plan_id: '1792612860_example-gallery',
      plan_revision: 1,
      plan_content_sha256: result.binding.before,
    },
  });
  expect(result.binding.after).not.toBe(result.binding.before);
  // The default engine excludes nothing; this consumer explicitly chooses its administrative keys.
  expect(fingerprintPlan(result.before).sha256).not.toBe(result.binding.before);
});

test('repeated real filesystem runs produce the same public demonstration without leaking temporary paths', async () => {
  const first = await buildLifecycle(plan, milestones);
  const second = await buildLifecycle(plan, milestones);
  expect(second).toEqual(first);
  expect(JSON.stringify(first)).not.toMatch(/jg-plans-showcase-|\/home\/|\/tmp\//u);
});
