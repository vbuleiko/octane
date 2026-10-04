import type { Metadata } from 'next';
import Image from 'next/image';
import { CtaStrip, PageHero, ServicePanels, VisitBlock } from '@/components/site/sections';
import { getSettings } from '@/lib/settings';
import { stockStats } from '@/lib/vehicles';

export const metadata: Metadata = {
  title: 'About us',
  description: 'Octane Auto is a car dealership in Montague Gardens, Cape Town: buying and selling quality pre-owned vehicles, motor services and finance.',
};

export default function AboutPage() {
  const settings = getSettings();
  const stats = stockStats();
  return (
    <>
      <PageHero eyebrow="About Octane Auto" title="Your drive" accent="is our passion" />

      <section className="container-pit flex flex-wrap items-center gap-12 py-16">
        <div className="min-w-0 flex-[1_1_440px] space-y-5 text-lg leading-relaxed text-smoke">
          <p className="text-2xl leading-snug text-chalk">
            Octane Auto is a car dealership in Montague Gardens, Cape Town, with an extensive collection of popular and sought-after brands.
          </p>
          <p>
            We specialise in both buying and selling, and we do it properly: every car is prepared and photographed in our own studio, priced honestly and backed by a team that knows it inside out.
          </p>
          <p>
            Comprehensive motor services and flexible finance make us a one-stop destination for all your automotive needs. Our commitment to quality and customer satisfaction means a trustworthy, enjoyable experience for every client.
          </p>
        </div>
        <div className="relative aspect-[4/3] min-w-0 flex-[1_1_440px]">
          <div aria-hidden="true" className="clip-slant absolute inset-0 translate-x-5 translate-y-5 bg-octane" />
          <Image src="/images/showroom.jpg" alt="The Octane Auto showroom" fill sizes="(min-width: 1024px) 50vw, 100vw" className="clip-slant object-cover" />
        </div>
      </section>

      <section className="container-pit pb-16">
        <div className="grid grid-cols-2 gap-y-8 border-y border-line py-10 lg:grid-cols-4">
          {[
            [String(stats.count), 'Cars in stock'],
            [String(stats.makes), 'Makes'],
            ['All', 'Major banks for finance'],
            ['2 yr', 'Optional warranty'],
          ].map(([n, label]) => (
            <div key={label} className="pr-4">
              <div className="display text-[clamp(56px,6vw,88px)] text-octane">{n}</div>
              <div className="text-[15px] font-bold uppercase tracking-[0.14em] text-smoke">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-pit pb-16">
        <h2 className="display mb-10 text-[clamp(44px,6vw,84px)]">
          What we <span className="text-octane">do</span>
        </h2>
        <ServicePanels />
      </section>

      <section className="container-pit pb-8">
        <VisitBlock settings={settings} />
      </section>

      <CtaStrip title="Ready to find your car?" text={`${stats.count} cars are waiting in the showroom.`} href="/showroom" cta="Enter showroom" />
    </>
  );
}
