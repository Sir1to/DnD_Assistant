import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const migrationsDirectory = join(process.cwd(), 'apps', 'api', 'drizzle');
const metadataDirectory = join(migrationsDirectory, 'meta');
const journalPath = join(metadataDirectory, '_journal.json');

const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
const entries = journal.entries ?? [];
const journalTags = entries.map(({ tag }) => tag);
const sqlTags = readdirSync(migrationsDirectory)
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort()
  .map((file) => basename(file, '.sql'));
const errors = [];

if (journal.version !== '7' || journal.dialect !== 'postgresql') {
  errors.push('Migration journal must use PostgreSQL metadata version 7.');
}

entries.forEach((entry, index) => {
  if (entry.idx !== index) {
    errors.push(`Journal entry ${entry.tag} has idx ${entry.idx}; expected ${index}.`);
  }
});

if (new Set(journalTags).size !== journalTags.length) {
  errors.push('Migration journal contains duplicate tags.');
}

if (JSON.stringify(journalTags) !== JSON.stringify(sqlTags)) {
  errors.push(
    `SQL migrations and journal differ.\nJournal: ${journalTags.join(', ')}\nSQL: ${sqlTags.join(', ')}`,
  );
}

const latestTag = journalTags.at(-1);
if (!latestTag) {
  errors.push('Migration journal is empty.');
} else {
  const prefix = latestTag.slice(0, 4);
  const snapshotPath = join(metadataDirectory, `${prefix}_snapshot.json`);

  try {
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    if (snapshot.version !== '7' || snapshot.dialect !== 'postgresql') {
      errors.push(`Latest snapshot ${prefix}_snapshot.json has incompatible metadata.`);
    }
  } catch {
    errors.push(`Latest migration ${latestTag} has no readable ${prefix}_snapshot.json.`);
  }
}

if (errors.length > 0) {
  throw new Error(errors.join('\n'));
}

console.log(
  `Migration chain is consistent: ${journalTags.length} migrations, latest ${latestTag}.`,
);
