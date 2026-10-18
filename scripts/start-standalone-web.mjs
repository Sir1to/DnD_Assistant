import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = join(root, 'apps', 'web');
const standaloneRoot = join(webRoot, '.next', 'standalone', 'apps', 'web');
const serverPath = join(standaloneRoot, 'server.js');

if (!existsSync(serverPath)) {
  throw new Error('Standalone web build not found. Run the production web build first.');
}

mkdirSync(join(standaloneRoot, '.next'), { recursive: true });
cpSync(join(webRoot, '.next', 'static'), join(standaloneRoot, '.next', 'static'), {
  recursive: true,
  force: true,
});
cpSync(join(webRoot, 'public'), join(standaloneRoot, 'public'), {
  recursive: true,
  force: true,
});

process.chdir(standaloneRoot);
await import(pathToFileURL(serverPath).href);
