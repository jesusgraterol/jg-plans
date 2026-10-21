import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPlan, createPlan, inspectPlan, updatePlan } from 'jg-plans';

// This example owns a temporary root. Never recursively remove a user's planning root.
const root = await mkdtemp(join(tmpdir(), 'jg-plans-example-'));
try {
  const created = await createPlan({
    root,
    slug: 'example',
    body: '# A small change\n\nKeep the intent close to the work.\n',
    milestones: '## Milestone 1: Implement\n**Status:** pending\n',
  });
  // Await the complete operation before starting the next edit of this document.
  await updatePlan(created.directory, {
    document: 'milestones',
    changes: [{ select: { ordinal: 1 }, set: { status: 'done' } }],
  });
  const observed = await inspectPlan(created.directory);
  const result = checkPlan({
    ...(observed.plan.state === 'readable' ? { plan: observed.plan.value.source } : {}),
    ...(observed.milestones.state === 'readable'
      ? { milestones: observed.milestones.value.source }
      : {}),
  });
  console.log(JSON.stringify({ conforms: result.conforms, diagnostics: result.diagnostics }));
} finally {
  await rm(root, { recursive: true, force: true });
}
