import type { Metadata } from 'next';
import Image from 'next/image';
import { CheckboxGroup, Field, LeadForm, Row, TextArea } from '@/components/site/forms';
import { PageHero, WORKSHOP_SERVICES, WorkshopSteps } from '@/components/site/sections';
import { getSettings } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Workshop — services, brakes, diagnostics',
  description: 'Octane Auto workshop in Montague Gardens: minor and major services, brakes, shocks, engine overhauls and diagnostics. We collect within 30 km and deliver back.',
};

export default function WorkshopPage() {
  const s = getSettings();
  return (
    <>
      <PageHero eyebrow={`Workshop · ${s.workshopAddress}`} title="The pit stop" accent="comes to you">
        Tell us what your car needs and we&apos;ll quote, collect it within 30 km of the workshop, do the work and deliver it back.
      </PageHero>

      <section className="container-pit flex flex-wrap items-stretch gap-10 py-16">
        <div className="relative min-h-80 min-w-0 flex-[1_1_360px]">
          <Image src="/images/studio-front.jpg" alt="A car in the Octane Auto studio" fill sizes="(min-width: 1024px) 33vw, 100vw" className="clip-slant-right object-cover" />
        </div>
        <div className="min-w-0 flex-[2_1_640px]">
          <h2 className="display mb-6 text-[clamp(40px,5vw,68px)]">
            How it <span className="text-octane">works</span>
          </h2>
          <WorkshopSteps />
          <h3 className="racing mb-3 mt-10 text-lg tracking-normal">Services include, but are not limited to</h3>
          <div className="racing flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[15px] text-smoke">
            {WORKSHOP_SERVICES.slice(0, -1).map((x, i) => (
              <span key={x} className="contents">
                {i > 0 && <span className="text-octane">/</span>}
                <span>{x}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-pit">
        <div className="container-pit flex flex-wrap gap-10 py-20">
          <div className="min-w-0 flex-[1_1_320px]">
            <h2 className="display mb-4 text-[clamp(40px,5vw,68px)]">
              Get a <span className="text-octane">quote</span>
            </h2>
            <p className="max-w-sm text-smoke">The more you tell us about the car and the problem, the more accurate our quotation will be.</p>
          </div>
          <div className="min-w-0 flex-[2_1_560px]">
            <LeadForm type="workshop" submitLabel="Request quotation">
              <CheckboxGroup name="services" legend="Required services" options={WORKSHOP_SERVICES} />
              <h3 className="racing mt-4 text-lg tracking-normal">Vehicle information</h3>
              <Row>
                <Field name="make" label="Make" placeholder="e.g. Volkswagen" />
                <Field name="model" label="Model" placeholder="e.g. Polo 1.2 TSI" />
              </Row>
              <Row>
                <Field name="year" label="Year of manufacture" inputMode="numeric" />
                <Field name="mileage" label="Mileage (km)" inputMode="numeric" />
              </Row>
              <TextArea name="message" label="Describe what the car needs" rows={4} />
              <h3 className="racing mt-4 text-lg tracking-normal">Contact information</h3>
              <Row>
                <Field name="name" label="Full name" required autoComplete="name" />
                <Field name="phone" label="Phone" required type="tel" autoComplete="tel" />
              </Row>
              <Row>
                <Field name="email" label="Email" type="email" autoComplete="email" />
                <Field name="preferredDate" label="Preferred collection date" type="date" />
              </Row>
            </LeadForm>
          </div>
        </div>
      </section>
    </>
  );
}
