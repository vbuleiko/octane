import fs from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'Octane Auto — Your drive is our passion';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function Checker({ rows = 2, size: s = 24 }: { rows?: number; size?: number }) {
  const cols = Math.ceil(1200 / s);
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'flex' }}>
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} style={{ width: s, height: s, background: (r + c) % 2 ? '#2b2b2e' : '#f48222' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default async function OpengraphImage() {
  const [logo, black, bold] = await Promise.all([
    fs.readFile(path.join(process.cwd(), 'public/brand/logo-circle.png')),
    fs.readFile(path.join(process.cwd(), 'node_modules/@fontsource/saira/files/saira-latin-900-italic.woff')),
    fs.readFile(path.join(process.cwd(), 'node_modules/@fontsource/saira/files/saira-latin-700-italic.woff')),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0b0b0b', color: '#fafafa', fontFamily: 'Saira' }}>
        <Checker />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 60, padding: '0 72px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${logo.toString('base64')}`} width={290} height={290} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 26, letterSpacing: 6, color: '#f48222', fontWeight: 700, fontStyle: 'italic', marginBottom: 18 }}>MONTAGUE GARDENS · CAPE TOWN</div>
            <div style={{ fontSize: 104, fontWeight: 900, fontStyle: 'italic', lineHeight: 0.9 }}>YOUR DRIVE IS</div>
            <div style={{ fontSize: 104, fontWeight: 900, fontStyle: 'italic', lineHeight: 0.9, color: '#f48222' }}>OUR PASSION</div>
          </div>
        </div>
        <Checker />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Saira', data: black, weight: 900, style: 'italic' },
        { name: 'Saira', data: bold, weight: 700, style: 'italic' },
      ],
    },
  );
}
