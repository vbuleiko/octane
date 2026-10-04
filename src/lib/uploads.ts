import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { UPLOADS_DIR } from './db';

const MAX_BYTES = 20 * 1024 * 1024;

export class UploadError extends Error {}

/** Normalises an uploaded photo (EXIF rotation, max 2000px, WebP) and stores it under /media. */
export async function saveImage(file: File, folder: 'vehicles' | 'leads' = 'vehicles'): Promise<string> {
  if (!file.size) throw new UploadError('Empty file');
  if (file.size > MAX_BYTES) throw new UploadError(`${file.name} is larger than 20 MB`);
  if (file.type && !file.type.startsWith('image/')) throw new UploadError(`${file.name} is not an image`);
  let output: Buffer;
  try {
    output = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new UploadError(`${file.name} could not be read. Please upload JPG, PNG or WebP.`);
  }
  const month = new Date().toISOString().slice(0, 7);
  const dir = path.join(UPLOADS_DIR, folder, month);
  await fs.mkdir(dir, { recursive: true });
  const name = `${crypto.randomUUID()}.webp`;
  await fs.writeFile(path.join(dir, name), output);
  return `/media/${folder}/${month}/${name}`;
}

export function resolveMediaPath(segments: string[]) {
  const target = path.resolve(UPLOADS_DIR, ...segments);
  return target.startsWith(UPLOADS_DIR + path.sep) ? target : null;
}

export async function deleteUpload(url: string) {
  if (!url.startsWith('/media/')) return;
  const target = resolveMediaPath(url.slice('/media/'.length).split('/'));
  if (target) await fs.rm(target, { force: true });
}
