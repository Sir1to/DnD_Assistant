import { spawn } from 'node:child_process';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BRANCH = 'development';
const DEFAULT_API_IMAGE = 'fog-of-lore-api:latest';
const DEFAULT_WEB_IMAGE = 'fog-of-lore-web:latest';

export function parseArguments(argv) {
  const options = {
    dryRun: false,
    skipPull: false,
    branch: process.env.DEPLOY_BRANCH || DEFAULT_BRANCH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--skip-pull') options.skipPull = true;
    else if (argument === '--branch') {
      const branch = argv[index + 1];
      if (!branch || branch.startsWith('--')) throw new Error('--branch requires a value');
      options.branch = branch;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

export function deploymentPlan({ branch, skipPull }) {
  return [
    'verify clean Git worktree, .env, Docker Compose, and current rollback images',
    'capture current health/build metadata and tag rollback images',
    'create and validate a PostgreSQL custom-format backup',
    ...(skipPull ? [] : [`fast-forward ${branch} from origin/${branch}`]),
    'install the exact lockfile and check migration metadata',
    'build release images and read their immutable build report',
    'stop API and web, apply migrations, and recreate both services',
    'wait for API and web health checks',
    'on failure: stop the new services, restore the database if migrated, restore images, and restart the previous release',
  ];
}

export function timestampForFile(date = new Date()) {
  return date.toISOString().replaceAll(':', '').replaceAll('-', '').replace('.000Z', 'Z');
}

export function rollbackTag(image, timestamp) {
  const withoutDigest = image.split('@')[0];
  const lastSlash = withoutDigest.lastIndexOf('/');
  const lastColon = withoutDigest.lastIndexOf(':');
  const repository = lastColon > lastSlash ? withoutDigest.slice(0, lastColon) : withoutDigest;
  return `${repository}:rollback-${timestamp.toLowerCase()}`;
}

function log(message) {
  process.stdout.write(`[deploy] ${message}\n`);
}

function run(command, args, { cwd, env = process.env, stdout = 'inherit', stdin } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: [stdin ? 'pipe' : 'inherit', stdout, 'inherit'],
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });

    if (stdin) {
      stdin.on('error', reject);
      stdin.pipe(child.stdin);
    }
  });
}

function capture(command, args, { cwd, env = process.env, allowFailure = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || allowFailure)
        resolvePromise({ code, stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(stderr.trim() || `${command} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function writeCommandOutput(command, args, target, { cwd, env = process.env } = {}) {
  await new Promise((resolvePromise, reject) => {
    const output = createWriteStream(target, { flags: 'wx', mode: 0o600 });
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let childFinished = false;
    let outputFinished = false;
    const finish = () => {
      if (childFinished && outputFinished) resolvePromise();
    };
    child.stdout.pipe(output);
    child.on('error', reject);
    output.on('error', reject);
    output.on('finish', () => {
      outputFinished = true;
      finish();
    });
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
      else {
        childFinished = true;
        finish();
      }
    });
  });
}

async function waitForUrl(url, attempts = 24, delayMs = 2500) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
  }
  throw lastError ?? new Error(`${url} did not become healthy`);
}

async function readCurrentBuild() {
  try {
    const response = await fetch('http://127.0.0.1:4000/api/health', {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return undefined;
    const payload = await response.json();
    return payload.build;
  } catch {
    return undefined;
  }
}

export function buildEnvironment(build, environment = process.env) {
  if (!build) return environment;
  return {
    ...environment,
    APP_VERSION: build.version,
    APP_COMMIT: build.commit,
    APP_BUILD_TIME: build.builtAt,
  };
}

function newestBuildReport(root, previousNames) {
  const reportsDirectory = join(root, 'deploy-reports');
  if (!existsSync(reportsDirectory)) throw new Error('release build did not create deploy-reports');
  const candidates = readdirSync(reportsDirectory)
    .filter(
      (name) => name.startsWith('build-') && name.endsWith('.json') && !previousNames.has(name),
    )
    .map((name) => ({ name, modified: statSync(join(reportsDirectory, name)).mtimeMs }))
    .sort((left, right) => right.modified - left.modified);
  if (!candidates[0]) throw new Error('release build did not create a new build report');
  return JSON.parse(readFileSync(join(reportsDirectory, candidates[0].name), 'utf8'));
}

async function ensurePreconditions(root, options, images) {
  if (!existsSync(join(root, '.env'))) throw new Error('.env is required in the repository root');
  const branch = await capture('git', ['branch', '--show-current'], { cwd: root });
  if (branch.stdout !== options.branch) {
    throw new Error(
      `expected branch ${options.branch}, found ${branch.stdout || '(detached HEAD)'}`,
    );
  }
  const status = await capture('git', ['status', '--porcelain'], { cwd: root });
  if (status.stdout) throw new Error('Git worktree must be clean before production deployment');
  await run('docker', ['compose', 'version'], { cwd: root });
  await run('docker', ['compose', 'config', '--quiet'], { cwd: root });
  for (const image of images)
    await run('docker', ['image', 'inspect', image], { cwd: root, stdout: 'ignore' });
}

async function rollback({ root, backupPath, migrationStarted, imagePairs, previousBuild }) {
  log('deployment failed; starting rollback');
  await run('docker', ['compose', 'stop', 'web', 'api'], { cwd: root }).catch(() => undefined);

  if (migrationStarted) {
    log(`restoring database from ${backupPath}`);
    await run(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'postgres',
        'sh',
        '-ec',
        'pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --clean --if-exists --exit-on-error',
      ],
      { cwd: root, stdin: createReadStream(backupPath) },
    );
  }

  for (const [rollbackImage, currentImage] of imagePairs) {
    await run('docker', ['image', 'tag', rollbackImage, currentImage], { cwd: root });
  }
  await run(
    'docker',
    ['compose', 'up', '--detach', '--no-build', '--force-recreate', 'api', 'web'],
    {
      cwd: root,
      env: buildEnvironment(previousBuild),
    },
  );
  await waitForUrl('http://127.0.0.1:4000/api/health');
  await waitForUrl('http://127.0.0.1:3000');
  log('previous release is healthy again; Git remains at the attempted release for diagnosis');
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.dryRun) {
    console.log(
      JSON.stringify({ branch: options.branch, steps: deploymentPlan(options) }, null, 2),
    );
    return;
  }

  const root = process.cwd();
  const apiImage = process.env.DEPLOY_API_IMAGE || DEFAULT_API_IMAGE;
  const webImage = process.env.DEPLOY_WEB_IMAGE || DEFAULT_WEB_IMAGE;
  const timestamp = timestampForFile();
  const backupPath = join(root, 'backups', `fog-of-lore-predeploy-${timestamp}.dump`);
  const imagePairs = [
    [rollbackTag(apiImage, timestamp), apiImage],
    [rollbackTag(webImage, timestamp), webImage],
  ];

  await ensurePreconditions(root, options, [apiImage, webImage]);
  const previousBuild = await readCurrentBuild();
  for (const [rollbackImage, currentImage] of imagePairs) {
    log(`tagging ${currentImage} as ${rollbackImage}`);
    await run('docker', ['image', 'tag', currentImage, rollbackImage], { cwd: root });
  }

  await mkdir(join(root, 'backups'), { recursive: true });
  log(`creating PostgreSQL backup ${basename(backupPath)}`);
  await writeCommandOutput(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'sh',
      '-ec',
      'pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom',
    ],
    backupPath,
    { cwd: root },
  );
  if (statSync(backupPath).size < 1024) throw new Error('database backup is unexpectedly small');
  await run('docker', ['compose', 'exec', '-T', 'postgres', 'pg_restore', '--list'], {
    cwd: root,
    stdin: createReadStream(backupPath),
    stdout: 'ignore',
  });

  let migrationStarted = false;
  try {
    if (!options.skipPull) {
      log(`fast-forwarding ${options.branch}`);
      await run('git', ['pull', '--ff-only', 'origin', options.branch], { cwd: root });
    }
    await run('corepack', ['pnpm', 'install', '--frozen-lockfile'], { cwd: root });
    await run('corepack', ['pnpm', 'migrations:check'], { cwd: root });

    const reportsDirectory = join(root, 'deploy-reports');
    const previousReports = existsSync(reportsDirectory)
      ? new Set(readdirSync(reportsDirectory))
      : new Set();
    await run('corepack', ['pnpm', 'release:build'], { cwd: root });
    const releaseBuild = newestBuildReport(root, previousReports);
    const releaseEnvironment = buildEnvironment(releaseBuild);

    await run('docker', ['compose', 'stop', 'web', 'api'], { cwd: root, env: releaseEnvironment });
    migrationStarted = true;
    await run('docker', ['compose', 'run', '--rm', 'api', 'pnpm', 'db:migrate'], {
      cwd: root,
      env: releaseEnvironment,
    });
    await run(
      'docker',
      ['compose', 'up', '--detach', '--no-build', '--force-recreate', 'api', 'web'],
      {
        cwd: root,
        env: releaseEnvironment,
      },
    );
    await waitForUrl('http://127.0.0.1:4000/api/health');
    await waitForUrl('http://127.0.0.1:3000');
    log(`release ${releaseBuild.version} (${releaseBuild.commit}) is healthy`);
    log(`rollback images and ${backupPath} were retained`);
  } catch (error) {
    try {
      await rollback({ root, backupPath, migrationStarted, imagePairs, previousBuild });
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'deployment and automatic rollback both failed',
        { cause: rollbackError },
      );
    }
    throw error;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
