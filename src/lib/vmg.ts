/**
 * Reads Octane Auto's stock from the VMG Software feed that powers the current
 * WordPress site, and normalises it into records for our own database.
 */

export const VMG_FEED_URL = 'https://www.octaneauto.co.za/wp-content/themes/vmg-motors-theme/filterData.php';

type FeedVehicle = {
  make: string | null;
  model: string | null;
  variant: string | null;
  year: number | null;
  value: number | null;
  mile: number | null;
  colour: string | null;
  body_type: string | null;
  fuelType: string | null;
  transmission: string | null;
  condition: string | null;
  stock_code: string | null;
  imageUrl: string | null;
  permaLink: string | null;
  dateString: number | null;
};

export type ImportedVehicle = {
  stockCode: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  price: number;
  mileage: number;
  colour: string;
  bodyType: string;
  fuelType: string;
  transmission: string;
  condition: string;
  description: string;
  appendFooter: boolean;
  extras: string[];
  photos: string[];
  sourceUrl: string;
  listedAt: string;
};

const MAKE_NAMES: Record<string, string> = {
  BMW: 'BMW',
  MINI: 'MINI',
  'MERCEDES-BENZ': 'Mercedes-Benz',
};

function capitalise(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function prettyMake(raw: string) {
  const key = raw.trim().toUpperCase();
  return MAKE_NAMES[key] ?? key.split(/\s+/).map(capitalise).join(' ');
}

/** "RANGE ROVER VELAR" → "Range Rover Velar", keeps short codes like "GP", "X3", "500X". */
function prettyModel(raw: string) {
  return raw
    .trim()
    .split(/\s+/)
    .map((token) =>
      token
        .split('-')
        .map((part) => (/^[A-Z]{4,}$/.test(part) ? capitalise(part) : part))
        .join('-'),
    )
    .join(' ');
}

/** Splits the feed's variant (which usually repeats the model) into a clean model and variant. */
export function splitModelVariant(rawModel: string, rawVariant: string) {
  const model = rawModel.trim();
  const variant = rawVariant.trim().replace(/\s+/g, ' ');
  const M = model.toUpperCase();
  const V = variant.toUpperCase();

  if (V.startsWith(M + ' ')) return { model: prettyModel(model), variant: variant.slice(model.length + 1) };

  const at = (' ' + V + ' ').indexOf(' ' + M + ' ');
  if (at > 0) {
    const prefix = variant.slice(0, at - 1);
    return { model: prettyModel(`${prefix} ${model}`), variant: variant.slice(at + model.length).trim() };
  }

  const first = M.split(/\s+/)[0];
  if (first && V.startsWith(first + ' ')) {
    return { model: prettyModel(model.split(/\s+/)[0]), variant: variant.slice(first.length + 1) };
  }

  return { model: prettyModel(model), variant };
}

function normaliseBody(raw: string | null | undefined) {
  if (!raw) return '';
  if (/bakkie|pick.?up|double cab|single cab/i.test(raw)) return 'Bakkie';
  return raw.trim();
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#039': "'" };

export function decodeEntities(s: string) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (m, code: string) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return m;
  });
}

/** Lines every listing repeats; we keep them as one switchable "standard footer" instead. */
const FOOTER_LINE = /^(peace of mind|finance options|finance available|trade-?ins? welcome|nationwide delivery|come on down to octane auto)/i;

export function cleanDescription(raw: string) {
  const lines = decodeEntities(raw)
    .replace(/\r\n?/g, '\n')
    .replace(/m,echanical/g, 'mechanical')
    // Sentences that were glued together in the DMS ("experience.Key features:Harman…").
    .replace(/([a-z0-9)][.!?:])([A-Z])/g, '$1\n$2')
    .split('\n')
    .map((line) => line.replace(/\?\?\s*/g, '').replace(/\s+/g, ' ').trim())
    .map((line) => line.replace(/^,\s*/, ''));
  const hadFooter = lines.some((line) => FOOTER_LINE.test(line));
  const body = lines
    .filter((line) => !FOOTER_LINE.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { description: body, hadFooter };
}

/** Some photos are linked via the (http-only) VMG feed host; the same files are served over https from S3. */
export function normalisePhotoUrl(url: string) {
  return url
    .replace(/^https?:\/\/feeds\.vmgsoftware\.co\.za\/images\/auto\//, 'https://s3-eu-west-1.amazonaws.com/vmg.images.production/')
    .replace(/^http:\/\//, 'https://');
}

export function parseDetailPage(html: string) {
  const photoNumbers = new Map<number, string>();
  for (const m of html.matchAll(/https?:\/\/[^"' ]+?_I(\d+)\.jpg/g)) {
    const n = Number(m[1]);
    if (!photoNumbers.has(n)) photoNumbers.set(n, normalisePhotoUrl(m[0]));
  }
  const photos = [...photoNumbers.entries()].sort((a, b) => a[0] - b[0]).map(([, url]) => url);

  // The page renders the content block twice; the first extras list is enough.
  const extrasBlock = html.match(/Extras:<\/span>([\s\S]*?)(?:DESCRIPTION:|<\/form>)/);
  const extras = [
    ...new Set(
      [...(extrasBlock?.[1] ?? '').matchAll(/<\/i>\s*([^<]+?)\s*<\/div>/g)].map((m) => decodeEntities(m[1]).trim()),
    ),
  ].filter(Boolean);

  const desc = html.match(/DESCRIPTION:<\/span><\/div>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
  const body = html.match(/Body Type: <\/span>([^<]*)</);
  return { photos, extras, description: desc ? desc[1] : '', bodyType: body ? body[1].trim() : '' };
}

async function getText(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (OctaneAuto importer)' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

export async function fetchFeed(): Promise<FeedVehicle[]> {
  const data = JSON.parse(await getText(VMG_FEED_URL)) as { vehicles?: FeedVehicle[] };
  return data.vehicles ?? [];
}

export async function importFromVmg(options: { concurrency?: number } = {}): Promise<ImportedVehicle[]> {
  const feed = (await fetchFeed()).filter((v) => v.stock_code && v.make && v.permaLink);
  const results: ImportedVehicle[] = [];
  const queue = [...feed];
  const workers = Array.from({ length: options.concurrency ?? 4 }, async () => {
    for (let v = queue.shift(); v; v = queue.shift()) {
      const detail = parseDetailPage(await getText(v.permaLink!));
      const { model, variant } = splitModelVariant(v.model ?? '', v.variant ?? '');
      const { description, hadFooter } = cleanDescription(detail.description);
      results.push({
        stockCode: v.stock_code!.trim(),
        make: prettyMake(v.make!),
        model,
        variant,
        year: v.year ?? 0,
        price: v.value ?? 0,
        mileage: v.mile ?? 0,
        colour: v.colour ? capitalise(v.colour) : '',
        bodyType: normaliseBody(v.body_type || detail.bodyType) || (/4X4|AWD|4MOTION|4\/MOT/i.test(variant) ? 'SUV' : ''),
        fuelType: v.fuelType ?? '',
        transmission: v.transmission ?? '',
        condition: v.condition ?? 'Excellent',
        description,
        appendFooter: hadFooter || !description,
        extras: detail.extras,
        photos: detail.photos.length ? detail.photos : v.imageUrl ? [normalisePhotoUrl(v.imageUrl)] : [],
        sourceUrl: v.permaLink!,
        listedAt: new Date((v.dateString ?? Date.now() / 1000) * 1000).toISOString(),
      });
    }
  });
  await Promise.all(workers);
  return results.sort((a, b) => b.listedAt.localeCompare(a.listedAt));
}
