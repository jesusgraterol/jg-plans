import assert from 'node:assert/strict';

import { configDefaults, defineConfig } from 'vitest/config';

const exclude = [
  ...configDefaults.exclude,
  '**/_archive/**',
  '**/_archives/**',
  '**/_backup/**',
  '**/_backups/**',
];

export default defineConfig(({ mode }) => {
  assert.ok(mode === 'test' || mode === 'essential', 'Test mode must be test or essential.');
  const isEssential = mode === 'essential';

  return {
    test: {
      projects: [
        {
          test: {
            name: 'unit',
            exclude: [...exclude, ...(isEssential ? ['src/content/utilities.test-unit.ts'] : [])],
            include: ['src/**/*.test-unit.ts', 'scripts/**/*.test-unit.ts'],
            tags: [{ name: 'full', description: 'Website content and presentation coverage.' }],
            retry: 0,
          },
        },
        {
          test: {
            name: 'integration',
            exclude: [
              ...exclude,
              ...(isEssential ? ['scripts/lifecycle/lifecycle.test-integration.ts'] : []),
            ],
            include: ['scripts/**/*.test-integration.ts'],
            tags: [{ name: 'full', description: 'Website content and presentation coverage.' }],
            retry: 0,
          },
        },
      ],
    },
  };
});
