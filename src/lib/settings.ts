import { db, schema } from './db';

export type Hours = { label: string; value: string }[];

export const DEFAULT_SETTINGS = {
  phone: '021 891 3342',
  email: 'conrad@octaneauto.co.za',
  /** International format without +, e.g. 27821234567. Empty hides the WhatsApp button. */
  whatsapp: '',
  address: 'Unit 6, 3 Esso Rd, Montague Gardens, Cape Town, 7441',
  mapUrl: 'https://goo.gl/maps/trQAx6PqpTVew6xi9',
  workshopAddress: 'Unit 13, Montague Drive, Montague Gardens, 7441',
  hours: [
    { label: 'Mon – Fri', value: '08:30 – 17:00' },
    { label: 'Saturday', value: '09:00 – 12:30' },
    { label: 'Sunday', value: 'Closed' },
    { label: 'Public holidays', value: 'Closed' },
  ] as Hours,
  financeRate: 12,
  financeTerm: 72,
  financeApplyUrl: 'https://eazyfin.co.za/Home/FinanceClient?companyId=1057',
  standardFooter:
    'Peace of mind: optional 2-year Prestige unlimited-kilometre extended mechanical warranty available.\nFinance available through all major banks.\nTrade-ins welcome.\nNationwide delivery available on request.',
  /** Stock code of the "car of the week" shown in the homepage hero. Empty = most recent featured car. */
  heroStockCode: 'OA460',
  tickerExtra: 'Finance through all major banks // Trade-ins welcome // Nationwide delivery on request',
  lastSync: null as null | { at: string; added: number; updated: number; markedSold: number },
};

export type Settings = typeof DEFAULT_SETTINGS;

export function getSettings(): Settings {
  const rows = db.select().from(schema.settings).all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...stored } as Settings;
}

export function saveSettings(values: Partial<Settings>) {
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue;
      tx.insert(schema.settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
        .run();
    }
  });
}

export function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`;
}
