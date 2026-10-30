import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getErrorCode } from 'jg-exception';
import {
  ERRORS,
  checkPlan,
  createPlan,
  inspectPlan,
  updatePlan,
  writePlanDocument,
  fingerprintPlan,
  observeCriteria,
  parseMilestones,
  parsePlan,
} from 'jg-plans';

import { ADMINISTRATIVE_KEYS, INITIAL_BODY, REVISED_CRITERION } from './constants.ts';
import { presentDirectory, presentInspection } from './transformers.ts';
import type { ILifecycle, ILifecycleCriterion } from './types.ts';

/**
 * Observes each criterion's delivering milestones and derived progress.
 * @param planSource The plan document.
 * @param milestoneSource The milestone document, when one exists.
 * @returns One entry per criterion, in document order.
 */
const summarizeCriteria = (planSource: string, milestoneSource?: string): ILifecycleCriterion[] =>
  observeCriteria(
    parsePlan(planSource),
    milestoneSource === undefined ? undefined : parseMilestones(milestoneSource),
  ).criteria.map(({ id, milestones, progress }) => ({
    id,
    milestones: milestones.map(({ ordinal }) => ordinal),
    progress,
  }));

/**
 * Builds a reproducible example through the public filesystem API in an owned temporary root.
 * Complete public results leave this function with disclosed filesystem path substitutions.
 * The sample metadata and milestone bytes come from registered public example documents.
 */
export const buildLifecycle = async (
  planSource: string,
  milestoneSource: string,
): Promise<ILifecycle> => {
  const seed = parsePlan(planSource);
  assert.ok(seed.metadata.id && seed.metadata.created_at && seed.metadata.updated_at);
  assert.equal(seed.metadata.protocol, '0.2');
  const root = await mkdtemp(join(tmpdir(), 'jg-plans-showcase-'));
  try {
    const created = await createPlan({
      root,
      slug: 'search-feedback',
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
    const drafted = summarizeCriteria(created.plan.source);
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
    const updatedPlan = await updatePlan(directory, {
      document: 'plan',
      expectedSha256: created.plan.sha256,
      set: { status: 'in progress', updated_at: seed.metadata.updated_at },
    });
    const writtenMilestones = await writePlanDocument(directory, {
      document: 'milestones',
      expectedSha256: null,
      source: boundMilestones,
    });
    const updated = await inspectPlan(directory);
    assert.ok(updated.plan.state === 'readable' && updated.milestones.state === 'readable');
    const before = updated.plan.value.source;
    const beforeFingerprint = fingerprintPlan(before, { excludeMetadataKeys: ADMINISTRATIVE_KEYS });
    assert.equal(beforeFingerprint.sha256, binding.plan_content_sha256);
    const progress = summarizeCriteria(before, boundMilestones);
    assert.ok(checkPlan({ plan: before, milestones: boundMilestones }).conforms);
    const writtenRevision = await writePlanDocument(directory, {
      document: 'plan',
      expectedSha256: updated.plan.sha256,
      body: INITIAL_BODY + REVISED_CRITERION,
      set: { revision: 2 },
    });
    const revised = await inspectPlan(directory);
    assert.ok(revised.plan.state === 'readable' && revised.milestones.state === 'readable');
    assert.equal(revised.milestones.value.source, boundMilestones);
    const afterFingerprint = fingerprintPlan(revised.plan.value.source, {
      excludeMetadataKeys: ADMINISTRATIVE_KEYS,
    });
    assert.ok(afterFingerprint.sha256 && afterFingerprint.sha256 !== beforeFingerprint.sha256);
    const revisedProgress = summarizeCriteria(revised.plan.value.source, boundMilestones);
    // the added criterion has no delivering milestone until the sequence is broken down again
    const check = checkPlan({ plan: revised.plan.value.source, milestones: boundMilestones });
    assert.equal(check.diagnostics.length, 1);
    const [diagnostic] = check.diagnostics;
    assert.ok(diagnostic?.location);
    const { line } = diagnostic.location;
    const unassigned = observeCriteria(parsePlan(revised.plan.value.source)).criteria.find(
      ({ location }) => location.line === line,
    );
    assert.ok(unassigned);
    const finding = { code: diagnostic.code, criterion: unassigned.id, line };
    // a writer still holding the hash it read before the revision is refused without a write
    let staleCode: string | null = null;
    try {
      await updatePlan(directory, {
        document: 'plan',
        expectedSha256: updated.plan.sha256,
        set: { status: 'done', updated_at: seed.metadata.updated_at },
      });
    } catch (error) {
      staleCode = getErrorCode(error);
    }
    assert.equal(staleCode, ERRORS.SOURCE_CHANGED);
    const afterStaleWrite = await inspectPlan(directory);
    assert.ok(afterStaleWrite.plan.state === 'readable');
    assert.equal(afterStaleWrite.plan.sha256, revised.plan.sha256);
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
      progress,
      finding,
      staleWrite: {
        expectedSha256: updated.plan.sha256,
        currentSha256: revised.plan.sha256,
        code: staleCode,
      },
      stages: [
        {
          id: 'create',
          label: 'Create',
          title: 'Start with one readable file.',
          description:
            'Numbered acceptance criteria give every requirement a stable ID from the first draft.',
          code: `const created = await createPlan({\n  root: './jg-plans',\n  slug: 'search-feedback',\n  body, // the Markdown body shown below\n  metadata, // the displayed example metadata, including protocol: '0.2'\n});`,
          source: created.plan.source,
          call: 'createPlan(options)',
          result: presentDirectory(created),
          operations: [],
          consumer: {
            plan: 'readable',
            milestones: inspected.milestones.state,
            revision: created.plan.metadata.revision,
            status: created.plan.metadata.status,
            criteria: drafted.map(({ id }) => id),
          },
        },
        {
          id: 'inspect',
          label: 'Inspect',
          title: 'Read what is actually there.',
          description:
            'One selected directory returns metadata, criteria and diagnostics without recreating anything.',
          code: 'const observed = await inspectPlan(created.directory);',
          source: created.plan.source,
          call: 'inspectPlan(directory)',
          result: presentInspection(inspected),
          operations: [],
          consumer: {
            plan: inspected.plan.state,
            milestones: inspected.milestones.state,
            metadata: created.plan.metadata,
            criteria: drafted.map(({ id, progress }) => ({ id, progress })),
          },
        },
        {
          id: 'update',
          label: 'Update',
          title: 'Make an explicit, guarded edit.',
          description:
            "Milestones name the criteria they deliver, and each criterion's progress follows their status.",
          code: `if (observed.plan.state === 'readable') {\n  await updatePlan(directory, {\n    document: 'plan',\n    expectedSha256: observed.plan.sha256,\n    set: { status: 'in progress', updated_at },\n  });\n}\n// Add the explicitly prepared milestone source as a separate guarded write.\nawait writePlanDocument(directory, {\n  document: 'milestones',\n  expectedSha256: null,\n  source: milestoneSource,\n});\nconst current = await inspectPlan(directory);`,
          source: before,
          call: 'inspectPlan(directory)',
          result: presentInspection(updated),
          operations: [
            { call: 'updatePlan(directory, patch)', result: presentDirectory(updatedPlan) },
            {
              call: 'writePlanDocument(directory, input)',
              result: presentDirectory(writtenMilestones),
            },
          ],
          consumer: {
            revision: updated.plan.value.metadata.revision,
            status: updated.plan.value.metadata.status,
            milestones: retained,
            criteria: progress,
            binding: 'current',
          },
        },
        {
          id: 'revise',
          label: 'Revise',
          title: 'Change the intent. Keep the context.',
          description:
            'A new criterion stays flagged by check until a milestone delivers it; existing IDs stay byte-for-byte.',
          code: `if (current.plan.state === 'readable') {\n  await writePlanDocument(directory, {\n    document: 'plan',\n    expectedSha256: current.plan.sha256,\n    body: revisedBody,\n    set: { revision: 2 },\n  });\n}\nconst revised = await inspectPlan(directory);\nif (revised.plan.state === 'readable' && revised.milestones.state === 'readable') {\n  const check = checkPlan({\n    plan: revised.plan.value.source,\n    milestones: revised.milestones.value.source,\n  });\n}`,

          source: revised.plan.value.source,
          call: 'inspectPlan(directory)',
          result: presentInspection(revised),
          operations: [
            {
              call: 'writePlanDocument(directory, input)',
              result: presentDirectory(writtenRevision),
            },
            { call: 'checkPlan(documents)', result: check },
          ],
          consumer: {
            revision: revised.plan.value.metadata.revision,
            status: revised.plan.value.metadata.status,
            milestones: retained,
            criteria: revisedProgress,
            binding: 'stale',
            check: { conforms: check.conforms, findings: [finding] },
          },
        },
      ],
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};
