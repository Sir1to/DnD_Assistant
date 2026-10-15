import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEnvironment,
  deploymentPlan,
  parseArguments,
  rollbackTag,
  timestampForFile,
} from './deploy-production.mjs';

test('parseArguments uses a safe production default', () => {
  assert.deepEqual(parseArguments([]), {
    branch: process.env.DEPLOY_BRANCH || 'development',
    dryRun: false,
    skipPull: false,
  });
});

test('parseArguments supports an explicit branch and local checkout', () => {
  assert.deepEqual(parseArguments(['--branch', 'release/0.2', '--skip-pull', '--dry-run']), {
    branch: 'release/0.2',
    dryRun: true,
    skipPull: true,
  });
});

test('parseArguments rejects incomplete and unknown options', () => {
  assert.throws(() => parseArguments(['--branch']), /requires a value/);
  assert.throws(() => parseArguments(['--force']), /Unknown argument/);
});

test('deploymentPlan includes rollback and conditionally includes pull', () => {
  const regular = deploymentPlan({ branch: 'development', skipPull: false });
  assert.ok(regular.some((step) => step.includes('origin/development')));
  assert.ok(regular.at(-1).startsWith('on failure:'));

  const local = deploymentPlan({ branch: 'development', skipPull: true });
  assert.equal(
    local.some((step) => step.includes('fast-forward')),
    false,
  );
});

test('timestampForFile creates a sortable UTC file token', () => {
  assert.equal(timestampForFile(new Date('2026-10-05T10:11:12.000Z')), '20261005T101112Z');
});

test('rollbackTag replaces an image tag without breaking registry ports', () => {
  assert.equal(
    rollbackTag('registry.example:5000/fog/api:latest', '20261005T101112Z'),
    'registry.example:5000/fog/api:rollback-20261005t101112z',
  );
  assert.equal(rollbackTag('fog-of-lore-web', 'ABC'), 'fog-of-lore-web:rollback-abc');
});

test('buildEnvironment preserves exact release metadata for compose recreate', () => {
  assert.deepEqual(
    buildEnvironment(
      { version: '0.2.0', commit: 'abcdef123456', builtAt: '2026-10-05T10:11:12.000Z' },
      { PATH: '/usr/bin' },
    ),
    {
      PATH: '/usr/bin',
      APP_VERSION: '0.2.0',
      APP_COMMIT: 'abcdef123456',
      APP_BUILD_TIME: '2026-10-05T10:11:12.000Z',
    },
  );
});
