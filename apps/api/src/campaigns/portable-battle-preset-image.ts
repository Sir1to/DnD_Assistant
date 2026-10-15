import { BadRequestException } from '@nestjs/common';
import type { PortableBattleCombatantPresetImage } from '@fog-of-lore/contracts';

export const portableBattlePresetImageMaxBytes = 512 * 1024;
export const portableBattlePresetImageMaxDimension = 4096;

const supportedMimeTypes = new Set<PortableBattleCombatantPresetImage['mimeType']>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function encodePortableBattlePresetImage(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): PortableBattleCombatantPresetImage {
  if (!supportedMimeTypes.has(mimeType as PortableBattleCombatantPresetImage['mimeType'])) {
    throw new BadRequestException('Portable presets support JPEG, PNG and WebP token images');
  }
  assertFileSize(buffer);
  const dimensions = readRasterDimensions(buffer, mimeType);
  assertDimensions(dimensions);
  return {
    fileName,
    mimeType: mimeType as PortableBattleCombatantPresetImage['mimeType'],
    byteLength: buffer.length,
    width: dimensions.width,
    height: dimensions.height,
    dataBase64: buffer.toString('base64'),
  };
}

export function decodePortableBattlePresetImage(image: PortableBattleCombatantPresetImage): Buffer {
  const buffer = Buffer.from(image.dataBase64, 'base64');
  const canonical = buffer.toString('base64').replace(/=+$/, '');
  if (canonical !== image.dataBase64.replace(/=+$/, '')) {
    throw new BadRequestException('Portable preset image has invalid base64 data');
  }
  assertFileSize(buffer);
  if (buffer.length !== image.byteLength) {
    throw new BadRequestException('Portable preset image byte length does not match its metadata');
  }
  const dimensions = readRasterDimensions(buffer, image.mimeType);
  assertDimensions(dimensions);
  if (dimensions.width !== image.width || dimensions.height !== image.height) {
    throw new BadRequestException('Portable preset image dimensions do not match its metadata');
  }
  return buffer;
}

function assertFileSize(buffer: Buffer): void {
  if (buffer.length < 1 || buffer.length > portableBattlePresetImageMaxBytes) {
    throw new BadRequestException('Portable preset images must be between 1 byte and 512 KiB');
  }
}

function assertDimensions(dimensions: { width: number; height: number }): void {
  if (
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > portableBattlePresetImageMaxDimension ||
    dimensions.height > portableBattlePresetImageMaxDimension
  ) {
    throw new BadRequestException('Portable preset images must be at most 4096 × 4096 pixels');
  }
}

function readRasterDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } {
  const dimensions =
    mimeType === 'image/png'
      ? readPngDimensions(buffer)
      : mimeType === 'image/jpeg'
        ? readJpegDimensions(buffer)
        : mimeType === 'image/webp'
          ? readWebpDimensions(buffer)
          : null;
  if (!dimensions) {
    throw new BadRequestException('Portable preset image data does not match its declared format');
  }
  return dimensions;
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < buffer.length) {
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === undefined || marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 1 >= buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += segmentLength;
  }
  return null;
}

function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (
    buffer.length < 30 ||
    buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    return null;
  }
  const chunk = buffer.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X') {
    return {
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1,
    };
  }
  if (chunk === 'VP8L' && buffer[20] === 0x2f) {
    return {
      width: (buffer[21]! | ((buffer[22]! & 0x3f) << 8)) + 1,
      height: ((buffer[22]! >> 6) | (buffer[23]! << 2) | ((buffer[24]! & 0x0f) << 10)) + 1,
    };
  }
  if (chunk === 'VP8 ' && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  return null;
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return buffer[offset]! | (buffer[offset + 1]! << 8) | (buffer[offset + 2]! << 16);
}
