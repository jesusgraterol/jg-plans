import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectToRejectCode } from 'jg-exception/testing';
import { ERRORS } from 'jg-plans';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OVERLAP_MAX_FOLDERS, OVERLAP_READ_BYTES, readOverlapPlans } from './overlaps.ts';

const IS_POSIX = process.platform !== 'win32';

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'jg-plans-overlaps-')));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const frontmatter = (id: string, extra = ''): string =>
  `---\nid: ${id}\nstatus: pending\nprotocol: '0.2'\nerror_codes: [{ repository: acme/app, registry: errors.md, first: 1, last: 2 }]\n${extra}---\n`;

const putPlan = async (name: string, source: string | Buffer, base = root): Promise<string> => {
  const directory = join(base, name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'plan.md'), source);
  return directory;
};

describe('readOverlapPlans', () => {
  it('reads each child folder plan from its frontmatter, and skips files and folders without plan.md', async () => {
    const a = await putPlan('a', `${frontmatter('a')}# A\n`);
    await mkdir(join(root, 'notes'));
    await writeFile(join(root, 'README.md'), '# not a plan folder\n');
    const read = await readOverlapPlans([root]);
    expect(read).toEqual({
      plans: [
        {
          directory: a,
          id: 'a',
          protocol: '0.2',
          status: 'pending',
          errorCodes: [{ repository: 'acme/app', registry: 'errors.md', first: 1, last: 2 }],
        },
      ],
      unreadable: [],
      isComplete: true,
    });
  });

  it('reads a plan without frontmatter as a 0.1 plan with no declarations', async () => {
    const directory = await putPlan('plain', '# Just Markdown\n');
    expect((await readOverlapPlans([root])).plans).toEqual([
      { directory, id: null, protocol: '0.1', status: null, errorCodes: [] },
    ]);
  });

  it.runIf(IS_POSIX)('never follows a linked folder or a linked plan.md', async () => {
    const outside = await realpath(await mkdtemp(join(tmpdir(), 'jg-plans-outside-')));
    try {
      const target = await putPlan('elsewhere', frontmatter('elsewhere'), outside);
      await symlink(target, join(root, 'linked-folder'));
      await mkdir(join(root, 'linked-file'));
      await symlink(join(target, 'plan.md'), join(root, 'linked-file', 'plan.md'));
      const read = await readOverlapPlans([root]);
      expect(read.plans).toEqual([]);
      expect(read.unreadable).toEqual([
        { directory: join(root, 'linked-file'), reason: 'not-a-file' },
      ]);
      expect(read.isComplete).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('reads only the first 64 KiB, which must hold the frontmatter', async () => {
    const body = `# Long\n${'é'.repeat(OVERLAP_READ_BYTES)}\n`;
    const long = await putPlan('long-body', `${frontmatter('long')}${body}`);
    const tooLong = await putPlan(
      'long-frontmatter',
      `---\nid: big\n# ${'x'.repeat(OVERLAP_READ_BYTES)}\n---\n# Late\n`,
    );
    const read = await readOverlapPlans([root]);
    expect(read.plans.map((item) => [item.directory, item.id])).toEqual([[long, 'long']]);
    expect(read.unreadable).toEqual([{ directory: tooLong, reason: 'frontmatter-too-large' }]);
    expect(read.isComplete).toBe(false);
  });

  it('reports invalid encoding, YAML, and error codes as unreadable', async () => {
    const encoding = await putPlan(
      'encoding',
      Buffer.concat([Buffer.from('---\nid: '), Buffer.from([0xff, 0xfe]), Buffer.from('\n---\n')]),
    );
    const yaml = await putPlan('yaml', "---\nid: [unclosed\nprotocol: '0.2'\n---\n");
    const codes = await putPlan(
      'codes',
      "---\nid: c\nstatus: pending\nprotocol: '0.2'\nerror_codes: [{ repository: acme/app, first: 2 }]\n---\n",
    );
    const read = await readOverlapPlans([root]);
    expect(read.unreadable).toEqual([
      { directory: codes, reason: 'invalid-error-codes' },
      { directory: encoding, reason: 'invalid-encoding' },
      { directory: yaml, reason: 'invalid-frontmatter' },
    ]);
    expect(read.isComplete).toBe(false);
  });

  it('reads at most 1024 folders per call, in name order across the roots given', async () => {
    const second = await realpath(await mkdtemp(join(tmpdir(), 'jg-plans-overlaps-second-')));
    try {
      await Promise.all(
        Array.from({ length: OVERLAP_MAX_FOLDERS }, (_, index) =>
          putPlan(`p${String(index).padStart(4, '0')}`, '# Plan\n'),
        ),
      );
      await putPlan('beyond', frontmatter('beyond'), second);
      const complete = await readOverlapPlans([root, root]);
      expect(complete.plans).toHaveLength(OVERLAP_MAX_FOLDERS);
      expect(complete.isComplete).toBe(true);
      const truncated = await readOverlapPlans([root, second]);
      expect(truncated.plans).toHaveLength(OVERLAP_MAX_FOLDERS);
      expect(truncated.plans.some((item) => item.id === 'beyond')).toBe(false);
      expect(truncated.isComplete).toBe(false);
    } finally {
      await rm(second, { recursive: true, force: true });
    }
  });

  it('throws JG_PLANS_READ_FAILED for a root it cannot list', async () => {
    await expectToRejectCode(readOverlapPlans([join(root, 'missing')]), ERRORS.READ_FAILED);
  });
});
