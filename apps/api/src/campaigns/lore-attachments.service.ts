import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LoreAttachment } from '@fog-of-lore/contracts';
import { and, eq } from 'drizzle-orm';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.module';
import { loreAttachments, loreEntries, loreEntryRecipients } from '../database/schema';
import { CampaignAccessService } from './campaign-access.service';

interface UploadedAttachment {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

@Injectable()
export class LoreAttachmentsService {
  private readonly root: string;

  public constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CampaignAccessService) private readonly access: CampaignAccessService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.root = path.resolve(config.getOrThrow<string>('FILE_STORAGE_PATH'), 'lore');
  }

  public async upload(
    userId: string,
    entryId: string,
    file?: UploadedAttachment,
  ): Promise<LoreAttachment> {
    const entry = await this.requireEntry(entryId);
    await this.access.requireEditor(userId, entry.campaignId);
    if (!file) throw new BadRequestException('Select a file to upload');
    if (!allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, GIF and PDF files are supported');
    }
    if (file.size < 1 || file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('File size must be between 1 byte and 10 MB');
    }
    if (!this.matchesSignature(file.mimetype, file.buffer)) {
      throw new BadRequestException('File contents do not match its declared type');
    }

    const storageKey = globalThis.crypto.randomUUID();
    const originalName = this.safeName(file.originalname);
    await mkdir(this.root, { recursive: true });
    await writeFile(this.filePath(storageKey), file.buffer, { flag: 'wx' });
    try {
      const [created] = await this.database
        .insert(loreAttachments)
        .values({
          loreEntryId: entryId,
          uploadedByUserId: userId,
          originalName,
          mimeType: file.mimetype,
          size: file.size,
          storageKey,
        })
        .returning();
      if (!created) throw new Error('Attachment insert did not return a row');
      return this.toAttachment(created);
    } catch (error) {
      await rm(this.filePath(storageKey), { force: true });
      throw error;
    }
  }

  public async read(
    userId: string,
    attachmentId: string,
  ): Promise<{ attachment: LoreAttachment; buffer: Buffer }> {
    const record = await this.load(attachmentId);
    if (!record) throw new NotFoundException('Attachment not found');
    await this.requireView(userId, record.loreEntryId);
    try {
      return {
        attachment: this.toAttachment(record),
        buffer: await readFile(this.filePath(record.storageKey)),
      };
    } catch {
      throw new NotFoundException('Attachment file not found');
    }
  }

  public async readForBattleScene(
    attachmentId: string,
    campaignId: string,
  ): Promise<{ attachment: LoreAttachment; buffer: Buffer }> {
    const [record] = await this.database
      .select({ attachment: loreAttachments })
      .from(loreAttachments)
      .innerJoin(loreEntries, eq(loreEntries.id, loreAttachments.loreEntryId))
      .where(and(eq(loreAttachments.id, attachmentId), eq(loreEntries.campaignId, campaignId)))
      .limit(1);
    if (!record || !record.attachment.mimeType.startsWith('image/')) {
      throw new NotFoundException('Battle background not found');
    }
    try {
      return {
        attachment: this.toAttachment(record.attachment),
        buffer: await readFile(this.filePath(record.attachment.storageKey)),
      };
    } catch {
      throw new NotFoundException('Battle background file not found');
    }
  }

  public async delete(userId: string, attachmentId: string): Promise<void> {
    const record = await this.load(attachmentId);
    if (!record) throw new NotFoundException('Attachment not found');
    const entry = await this.requireEntry(record.loreEntryId);
    await this.access.requireEditor(userId, entry.campaignId);
    await rm(this.filePath(record.storageKey), { force: true });
    await this.database.delete(loreAttachments).where(eq(loreAttachments.id, attachmentId));
  }

  public async listByEntries(entryIds: string[]): Promise<Map<string, LoreAttachment[]>> {
    const result = new Map<string, LoreAttachment[]>();
    if (entryIds.length === 0) return result;
    const records = await this.database.select().from(loreAttachments);
    for (const record of records) {
      if (!entryIds.includes(record.loreEntryId)) continue;
      result.set(record.loreEntryId, [
        ...(result.get(record.loreEntryId) ?? []),
        this.toAttachment(record),
      ]);
    }
    return result;
  }

  public async deleteForEntry(entryId: string): Promise<void> {
    const records = await this.database
      .select()
      .from(loreAttachments)
      .where(eq(loreAttachments.loreEntryId, entryId));
    await Promise.all(
      records.map(({ storageKey }) => rm(this.filePath(storageKey), { force: true })),
    );
  }

  private async requireView(userId: string, entryId: string): Promise<void> {
    const entry = await this.requireEntry(entryId);
    const role = await this.access.requireMembership(userId, entry.campaignId);
    if (role !== 'PLAYER') return;
    if (entry.status !== 'PUBLISHED' || entry.audience === 'MASTER')
      throw new NotFoundException('Attachment not found');
    if (entry.audience === 'ALL_PLAYERS') return;
    const [recipient] = await this.database
      .select({ userId: loreEntryRecipients.userId })
      .from(loreEntryRecipients)
      .where(
        and(eq(loreEntryRecipients.loreEntryId, entryId), eq(loreEntryRecipients.userId, userId)),
      )
      .limit(1);
    if (!recipient) throw new NotFoundException('Attachment not found');
  }

  private async requireEntry(entryId: string) {
    const [entry] = await this.database
      .select({
        campaignId: loreEntries.campaignId,
        status: loreEntries.status,
        audience: loreEntries.audience,
      })
      .from(loreEntries)
      .where(eq(loreEntries.id, entryId))
      .limit(1);
    if (!entry) throw new NotFoundException('Lore entry not found');
    return entry;
  }

  private async load(attachmentId: string) {
    const [record] = await this.database
      .select()
      .from(loreAttachments)
      .where(eq(loreAttachments.id, attachmentId))
      .limit(1);
    return record;
  }

  private filePath(storageKey: string): string {
    return path.join(this.root, storageKey);
  }
  private safeName(name: string): string {
    const sanitized = [...path.basename(name)]
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join('')
      .trim()
      .slice(0, 255);
    return sanitized || 'attachment';
  }
  private toAttachment(record: typeof loreAttachments.$inferSelect): LoreAttachment {
    return {
      id: record.id,
      loreEntryId: record.loreEntryId,
      originalName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
      createdAt: record.createdAt.toISOString(),
    };
  }
  private matchesSignature(mimeType: string, buffer: Buffer): boolean {
    if (mimeType === 'image/jpeg')
      return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    if (mimeType === 'image/png')
      return buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mimeType === 'image/gif')
      return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
    if (mimeType === 'image/webp')
      return (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    return false;
  }
}
