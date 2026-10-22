import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPlan,
  createPlan,
  inspectPlan,
  updatePlan,
  writePlanDocument,
  removeMilestones,
  preparePlanDocumentWrite,
} from 'jg-plans';

// This example owns a temporary root. Never recursively remove a user's planning root.
const root = await mkdtemp(join(tmpdir(), 'jg-plans-example-'));
try {
  const created = await createPlan({
    root,
    slug: 'example',
    body: '# A small change\n\nKeep the intent close to the work.\n',
    milestones: '## Milestone 1: Implement\n**Status:** pending\n',
  });
  // A consumer journal stores exact prepared source/IDs once, then replays those bytes.
  const prepared = preparePlanDocumentWrite(created.milestones.source, {
    document: 'milestones',
    expectedSha256: created.milestones.sha256,
    source: created.milestones.source,
    assignMissingIds: true,
  });
  const written = await writePlanDocument(created.directory, {
    document: 'milestones',
    expectedSha256: created.milestones.sha256,
    source: prepared.source,
  });
  await updatePlan(created.directory, {
    document: 'milestones',
    expectedSha256: written.sha256,
    changes: [{ select: { ordinal: 1 }, set: { status: 'done' } }],
  });
  const observed = await inspectPlan(created.directory);
  // Body/core metadata can also be replaced together using the observed digest.
  if (observed.plan.state === 'readable')
    await writePlanDocument(created.directory, {
      document: 'plan',
      expectedSha256: observed.plan.sha256,
      body: observed.plan.value.body,
      set: { revision: 2 },
    });
  const result = checkPlan({
    ...(observed.plan.state === 'readable' ? { plan: observed.plan.value.source } : {}),
    ...(observed.milestones.state === 'readable'
      ? { milestones: observed.milestones.value.source }
      : {}),
  });
  if (observed.milestones.state === 'readable')
    await removeMilestones(created.directory, {
      expectedSha256: observed.milestones.sha256,
    });
  console.log(JSON.stringify({ conforms: result.conforms, diagnostics: result.diagnostics }));
} finally {
  await rm(root, { recursive: true, force: true });
}
