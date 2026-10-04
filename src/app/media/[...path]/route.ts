import fs from 'node:fs/promises';
import path from 'node:path';
import { getSession } from '@/lib/auth';
import { resolveMediaPath } from '@/lib/uploads';

const TYPES: Record<string, string> = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const segments = (await ctx.params).path;
  // Photos customers send with sell / trade-in requests are personal information: staff only.
  const isPrivate = segments[0] === 'leads';
  if (isPrivate && !(await getSession())) return new Response('Not found', { status: 404 });
  const file = resolveMediaPath(segments);
  const type = file && TYPES[path.extname(file).toLowerCase()];
  if (!file || !type) return new Response('Not found', { status: 404 });
  try {
    const body = await fs.readFile(file);
    return new Response(new Uint8Array(body), {
      headers: { 'content-type': type, 'cache-control': isPrivate ? 'private, no-store' : 'public, max-age=31536000, immutable' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
