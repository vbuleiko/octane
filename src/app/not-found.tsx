import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Link href="/" aria-label="Octane Auto home">
        <Image src="/brand/logo-circle.png" alt="Octane Auto" width={96} height={96} />
      </Link>
      <h1 className="display text-[clamp(56px,9vw,120px)]">
        Off the <span className="text-octane">track</span>
      </h1>
      <p className="text-smoke">This page doesn&apos;t exist.</p>
      <Link href="/showroom" className="racing skew bg-octane px-7 py-3 text-ink">
        <span className="unskew">Back to the showroom</span>
      </Link>
    </main>
  );
}
