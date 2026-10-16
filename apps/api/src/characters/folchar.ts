import { createHash } from 'node:crypto';

import {
  characterDocumentV2Schema,
  characterRuntimeStateSchema,
  characterSheetStatusSchema,
} from '@fog-of-lore/contracts';
import { z } from 'zod';

const MAX_ARCHIVE_BYTES = 6 * 1024 * 1024;
const MAX_ENTRY_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 4;

const manifestSchema = z.object({
  format: z.literal('fog-of-lore.character'),
  version: z.object({ major: z.literal(1), minor: z.int().nonnegative() }),
  exportedAt: z.string().datetime(),
  ruleset: z.object({
    id: z.literal('dnd5e-srd-5.2.1'),
    version: z.literal('5.2.1'),
  }),
  files: z
    .array(
      z.object({
        path: z.enum(['character.json', 'assets/portrait.webp']),
        mediaType: z.string().min(1).max(100),
        bytes: z.int().nonnegative().max(MAX_ENTRY_BYTES),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        license: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(2),
});

const portableCharacterSchema = z.object({
  name: z.string().trim().min(1).max(160),
  status: characterSheetStatusSchema.exclude(['ARCHIVED']),
  document: characterDocumentV2Schema,
  runtime: characterRuntimeStateSchema.omit({ revision: true, updatedAt: true }),
});

export type FolcharCharacter = z.infer<typeof portableCharacterSchema>;

export interface BuildFolcharInput {
  exportedAt: string;
  character: FolcharCharacter;
  portrait?: Buffer;
}

export interface ParsedFolchar {
  character: FolcharCharacter;
  portrait?: Buffer;
  exportedAt: string;
}

export function buildFolchar(input: BuildFolcharInput): Buffer {
  const character = portableCharacterSchema.parse(input.character);
  const characterBuffer = jsonBuffer(character);
  const payloads = new Map<string, Buffer>([['character.json', characterBuffer]]);
  if (input.portrait) {
    if (input.portrait.length > MAX_ENTRY_BYTES) throw new Error('Portrait is too large');
    if (!isWebp(input.portrait)) throw new Error('Portable portraits must be WebP images');
    payloads.set('assets/portrait.webp', input.portrait);
  }
  const files = [...payloads].map(([path, data]) => ({
    path: path as 'character.json' | 'assets/portrait.webp',
    mediaType: path === 'character.json' ? 'application/json' : 'image/webp',
    bytes: data.length,
    sha256: sha256(data),
    ...(path === 'character.json' ? { license: 'CC-BY-4.0 rules data' } : {}),
  }));
  const manifest = jsonBuffer(
    manifestSchema.parse({
      format: 'fog-of-lore.character',
      version: { major: 1, minor: 0 },
      exportedAt: input.exportedAt,
      ruleset: { id: 'dnd5e-srd-5.2.1', version: '5.2.1' },
      files,
    }),
  );
  const checksums = Buffer.from(
    files.map(({ sha256: checksum, path }) => `${checksum}  ${path}`).join('\n') + '\n',
    'utf8',
  );
  return createStoredZip([
    ['manifest.json', manifest],
    ['character.json', characterBuffer],
    ...([...payloads].filter(([path]) => path !== 'character.json') as [string, Buffer][]),
    ['checksums.sha256', checksums],
  ]);
}

export function parseFolchar(archive: Buffer): ParsedFolchar {
  if (archive.length === 0 || archive.length > MAX_ARCHIVE_BYTES) {
    throw new Error('Archive size is outside the allowed range');
  }
  const entries = readStoredZip(archive);
  const allowed = new Set([
    'manifest.json',
    'character.json',
    'assets/portrait.webp',
    'checksums.sha256',
  ]);
  for (const path of entries.keys()) {
    if (!allowed.has(path)) throw new Error(`Unexpected archive entry: ${path}`);
  }
  const manifestBuffer = requireEntry(entries, 'manifest.json');
  const characterBuffer = requireEntry(entries, 'character.json');
  const checksumBuffer = requireEntry(entries, 'checksums.sha256');
  const manifest = manifestSchema.parse(parseJson(manifestBuffer, 'manifest.json'));
  const declaredPaths = new Set(manifest.files.map(({ path }) => path));
  if (!declaredPaths.has('character.json')) throw new Error('Character payload is not declared');
  const checksums = parseChecksums(checksumBuffer);
  for (const file of manifest.files) {
    const data = requireEntry(entries, file.path);
    if (data.length !== file.bytes || sha256(data) !== file.sha256) {
      throw new Error(`Checksum or size mismatch for ${file.path}`);
    }
    if (checksums.get(file.path) !== file.sha256) {
      throw new Error(`Checksum list mismatch for ${file.path}`);
    }
  }
  const portrait = entries.get('assets/portrait.webp');
  if (Boolean(portrait) !== declaredPaths.has('assets/portrait.webp')) {
    throw new Error('Portrait declaration does not match archive contents');
  }
  if (portrait && !isWebp(portrait)) throw new Error('Portrait contents are not WebP');
  return {
    character: portableCharacterSchema.parse(parseJson(characterBuffer, 'character.json')),
    portrait,
    exportedAt: manifest.exportedAt,
  };
}

function createStoredZip(entries: [string, Buffer][]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [path, data] of entries) {
    const name = Buffer.from(path, 'utf8');
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    localParts.push(local, name, data);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function readStoredZip(archive: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 4 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    if (entries.size >= MAX_ENTRIES || offset + 30 > archive.length) {
      throw new Error('Archive contains too many or malformed entries');
    }
    const flags = archive.readUInt16LE(offset + 6);
    const method = archive.readUInt16LE(offset + 8);
    const expectedCrc = archive.readUInt32LE(offset + 14);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const uncompressedSize = archive.readUInt32LE(offset + 22);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    if ((flags & 0x0009) !== 0 || method !== 0 || compressedSize !== uncompressedSize) {
      throw new Error('Only unencrypted, stored ZIP entries are supported');
    }
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error('Archive entry is too large');
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) throw new Error('Archive entry exceeds file boundary');
    const path = archive.subarray(nameStart, nameStart + nameLength).toString('utf8');
    if (!isSafePath(path) || entries.has(path)) throw new Error('Archive contains an unsafe path');
    const data = Buffer.from(archive.subarray(dataStart, dataEnd));
    if (crc32(data) !== expectedCrc) throw new Error(`CRC mismatch for ${path}`);
    entries.set(path, data);
    offset = dataEnd;
  }
  if (
    entries.size === 0 ||
    offset + 4 > archive.length ||
    archive.readUInt32LE(offset) !== 0x02014b50
  ) {
    throw new Error('Archive central directory is missing');
  }
  return entries;
}

function isSafePath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 200 &&
    !path.startsWith('/') &&
    !path.startsWith('\\') &&
    !/^[a-z]:/i.test(path) &&
    !path.split(/[\\/]/).includes('..') &&
    !path.includes('\\')
  );
}

function parseChecksums(buffer: Buffer): Map<string, string> {
  const checksums = new Map<string, string>();
  for (const line of buffer.toString('utf8').trim().split('\n')) {
    const match = /^([a-f0-9]{64})[ ]{2}(.+)$/.exec(line.trimEnd());
    const checksum = match?.[1];
    const path = match?.[2];
    if (!checksum || !path || !isSafePath(path)) throw new Error('Malformed checksum list');
    checksums.set(path, checksum);
  }
  return checksums;
}

function parseJson(buffer: Buffer, path: string): unknown {
  try {
    return JSON.parse(buffer.toString('utf8')) as unknown;
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }
}

function requireEntry(entries: Map<string, Buffer>, path: string): Buffer {
  const entry = entries.get(path);
  if (!entry) throw new Error(`Archive entry is missing: ${path}`);
  return entry;
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isWebp(data: Buffer): boolean {
  return (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}
