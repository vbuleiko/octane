import { SkewLink } from '@/components/site/SkewLink';

export default function NotFound() {
  return (
    <section className="container-pit flex min-h-[60vh] flex-col items-start justify-center gap-6 py-20">
      <span className="eyebrow">Error 404</span>
      <h1 className="display text-[clamp(64px,10vw,150px)]">
        Off the <span className="text-octane">track</span>
      </h1>
      <p className="max-w-lg text-lg text-smoke">This page doesn&apos;t exist, or the car has already found a new home.</p>
      <div className="flex flex-wrap gap-4 pl-2">
        <SkewLink href="/showroom">Back to the showroom</SkewLink>
        <SkewLink href="/" variant="ghost">
          Home
        </SkewLink>
      </div>
    </section>
  );
}
