import { configDefaults, defineConfig } from 'vitest/config';

const exclude = [
  ...configDefaults.exclude,
  '**/_archive/**',
  '**/_archives/**',
  '**/_backup/**',
  '**/_backups/**',
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          exclude,
          include: ['src/**/*.test-unit.ts', 'scripts/**/*.test-unit.ts'],
          retry: 0,
        },
      },
      {
        test: {
          name: 'integration',
          exclude,
          include: ['scripts/**/*.test-integration.ts'],
          retry: 0,
        },
      },
    ],
  },
});
