import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPlan,
  inspectPlan,
  updatePlan,
  writePlanDocument,
  fingerprintPlan,
  parsePlan,
} from 'jg-plans';

import { ADMINISTRATIVE_KEYS, INITIAL_BODY, REVISED_REQUIREMENT } from './constants.ts';
import type { ILifecycle } from './types.ts';

/**
 * Builds a reproducible example through the public filesystem API in an owned temporary root.
 * Only selected document observations leave this function; no temporary path enters the site.
 * The sample metadata and milestone bytes come from registered public example documents.
 */
export const buildLifecycle = async (
  planSource: string,
  milestoneSource: string,
): Promise<ILifecycle> => {
  const seed = parsePlan(planSource);
  assert.ok(seed.metadata.id && seed.metadata.created_at && seed.metadata.updated_at);
  const root = await mkdtemp(join(tmpdir(), 'jg-plans-showcase-'));
  try {
    const created = await createPlan({
      root,
      slug: 'example-gallery',
      body: INITIAL_BODY,
      metadata: {
        ...seed.metadata,
        revision: 1,
        status: 'pending',
        updated_at: seed.metadata.created_at,
      },
    });
    const directory = created.directory;
    const inspected = await inspectPlan(directory);
    assert.equal(inspected.plan.state, 'readable');
    assert.equal(inspected.milestones.state, 'missing');
    const originalFingerprint = fingerprintPlan(created.plan.source, {
      excludeMetadataKeys: ADMINISTRATIVE_KEYS,
    });
    assert.ok(originalFingerprint.sha256);
    const binding = {
      plan_id: seed.metadata.id,
      plan_revision: 1,
      plan_content_sha256: originalFingerprint.sha256,
    };
    const boundMilestones = `---\njg_skills:\n  plan_id: ${JSON.stringify(binding.plan_id)}\n  plan_revision: ${binding.plan_revision}\n  plan_content_sha256: ${binding.plan_content_sha256}\n---\n\n${milestoneSource}`;
    await updatePlan(directory, {
      document: 'plan',
      expectedSha256: created.plan.sha256,
      set: { status: 'in progress', updated_at: seed.metadata.updated_at },
    });
    await writePlanDocument(directory, {
      document: 'milestones',
      expectedSha256: null,
      source: boundMilestones,
    });
    const updated = await inspectPlan(directory);
    assert.ok(updated.plan.state === 'readable' && updated.milestones.state === 'readable');
    const before = updated.plan.value.source;
    const beforeFingerprint = fingerprintPlan(before, { excludeMetadataKeys: ADMINISTRATIVE_KEYS });
    assert.equal(beforeFingerprint.sha256, binding.plan_content_sha256);
    await writePlanDocument(directory, {
      document: 'plan',
      expectedSha256: updated.plan.sha256,
      body: INITIAL_BODY + '\n' + REVISED_REQUIREMENT,
      set: { revision: 2 },
    });
    const revised = await inspectPlan(directory);
    assert.ok(revised.plan.state === 'readable' && revised.milestones.state === 'readable');
    assert.equal(revised.milestones.value.source, boundMilestones);
    const afterFingerprint = fingerprintPlan(revised.plan.value.source, {
      excludeMetadataKeys: ADMINISTRATIVE_KEYS,
    });
    assert.ok(afterFingerprint.sha256 && afterFingerprint.sha256 !== beforeFingerprint.sha256);
    const retained = revised.milestones.value.milestones.map(({ id, title, status }) => ({
      id,
      title,
      status,
    }));
    return {
      before,
      after: revised.plan.value.source,
      unchangedMilestones: boundMilestones,

      retained,
      binding: { before: beforeFingerprint.sha256!, after: afterFingerprint.sha256 },
      stages: [
        {
          id: 'create',
          label: 'Create',
          title: 'Start with one readable file.',
          description:
            'A plan needs no breakdown. Creation preserves your Markdown body and creates only the document you requested.',
          code: `const created = await createPlan({\n  root: './coding-agent-planning',\n  slug: 'example-gallery',\n  body, // the Markdown body shown below\n  metadata, // the displayed example metadata\n});`,
          source: created.plan.source,
          result: {
            plan: 'readable',
            milestones: inspected.milestones.state,
            revision: created.plan.metadata.revision,
            status: created.plan.metadata.status,
          },
        },
        {
          id: 'inspect',
          label: 'Inspect',
          title: 'Read what is actually there.',
          description:
            'Inspect one selected directory. Observe metadata, body text, diagnostics and an absent optional sequence without recreating it.',
          code: 'const observed = await inspectPlan(created.directory);',
          source: created.plan.source,
          result: {
            plan: inspected.plan.state,
            milestones: inspected.milestones.state,
            metadata: created.plan.metadata,
          },
        },
        {
          id: 'update',
          label: 'Update',
          title: 'Make an explicit, guarded edit.',
          description:
            'Update status against the observed digest. Here an existing public milestone sample is added explicitly; its done marker is example input, not newly verified work.',
          code: `if (observed.plan.state === 'readable') {\n  await updatePlan(directory, {\n    document: 'plan',\n    expectedSha256: observed.plan.sha256,\n    set: { status: 'in progress', updated_at },\n  });\n}\n// Add the explicitly prepared milestone source as a separate guarded write.\nawait writePlanDocument(directory, {\n  document: 'milestones',\n  expectedSha256: null,\n  source: milestoneSource,\n});`,
          source: before,
          result: {
            revision: updated.plan.value.metadata.revision,
            status: updated.plan.value.metadata.status,
            milestones: retained,
            binding: 'current',
          },
        },
        {
          id: 'revise',
          label: 'Revise',
          title: 'Change the intent. Keep the context.',
          description:
            'Replace the body and increment revision explicitly. Existing milestone IDs and status markers remain byte-for-byte; the example skills binding is now stale.',
          code: `if (current.plan.state === 'readable') {\n  await writePlanDocument(directory, {\n    document: 'plan',\n    expectedSha256: current.plan.sha256,\n    body: revisedBody,\n    set: { revision: 2 },\n  });\n}`,
          source: revised.plan.value.source,
          result: {
            revision: revised.plan.value.metadata.revision,
            status: revised.plan.value.metadata.status,
            milestones: retained,
            binding: 'stale',
          },
        },
      ],
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};
