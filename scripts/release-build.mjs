import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const commitHash = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const dirty =
  execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  }).trim().length > 0;
const commit = `${commitHash}${dirty ? '-dirty' : ''}`;
const builtAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  version,
  commit,
  dirty,
  builtAt,
  services: ['api', 'web'],
};

if (dryRun) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const result = spawnSync('docker', ['compose', 'build', 'api', 'web'], {
  cwd: root,
  env: {
    ...process.env,
    APP_VERSION: version,
    APP_COMMIT: commit,
    APP_BUILD_TIME: builtAt,
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const reportsDirectory = join(root, 'deploy-reports');
const fileTimestamp = builtAt.replaceAll(':', '').replaceAll('-', '').replace('.000Z', 'Z');
const reportPath = join(reportsDirectory, `build-${fileTimestamp}.json`);
mkdirSync(reportsDirectory, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Release build report: ${reportPath}`);
