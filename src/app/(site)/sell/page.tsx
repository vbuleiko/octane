import type { Metadata } from 'next';
import { Icon, type IconName } from '@/components/Icon';
import { Field, FileField, LeadForm, Row, SelectField, TextArea } from '@/components/site/forms';
import { PageHero } from '@/components/site/sections';

export const metadata: Metadata = {
  title: 'Sell or trade in your car',
  description: 'Sell your car to Octane Auto or trade it in on your next one. Send us the details and photos for an offer.',
};

const STEPS: [IconName, string, string][] = [
  ['file', 'Tell us about it', 'Make, model, mileage, condition and a few photos.'],
  ['money', 'Get an offer', 'We look at the market and come back to you with a price.'],
  ['swap', 'Sell or swap', 'Take payment, or put the value towards a car from our showroom.'],
];

export default function SellPage() {
  return (
    <>
      <PageHero eyebrow="We buy cars" title="Sell or" accent="trade in">
        Octane Auto buys as well as sells. Send us your car&apos;s details and we&apos;ll come back with an offer or a trade-in value.
      </PageHero>

      <section className="container-pit grid gap-4 py-16 md:grid-cols-3">
        {STEPS.map(([icon, title, text], i) => (
          <div key={title} className="flex flex-col gap-3 bg-panel p-7">
            <div className="flex items-center justify-between">
              <Icon name={icon} size={30} className="text-octane" />
              <span className="display text-5xl text-transparent [-webkit-text-stroke:1.5px_var(--color-octane)]">{String(i + 1).padStart(2, '0')}</span>
            </div>
            <h2 className="display text-3xl">{title}</h2>
            <p className="text-smoke">{text}</p>
          </div>
        ))}
      </section>

      <section className="bg-pit">
        <div className="container-pit flex flex-wrap gap-10 py-20">
          <div className="min-w-0 flex-[1_1_320px]">
            <h2 className="display mb-4 text-[clamp(40px,5vw,68px)]">
              Value <span className="text-octane">my car</span>
            </h2>
            <p className="max-w-sm text-smoke">
              Clear photos of the outside, the interior, the odometer and any damage help us give you an accurate offer without a trip to the showroom.
            </p>
          </div>
          <div className="min-w-0 flex-[2_1_560px]">
            <LeadForm type="tradein" submitLabel="Get my offer">
              <Row>
                <Field name="make" label="Make" placeholder="e.g. Toyota" />
                <Field name="model" label="Model & variant" placeholder="e.g. Fortuner 2.8 GD-6 4x4" />
              </Row>
              <Row>
                <Field name="year" label="Year" inputMode="numeric" />
                <Field name="mileage" label="Mileage (km)" inputMode="numeric" />
              </Row>
              <Row>
                <SelectField name="condition" label="Condition" placeholder="Select" options={['Excellent', 'Good', 'Fair', 'Needs work']} />
                <Field name="askingPrice" label="Price in mind (optional)" placeholder="R" />
              </Row>
              <SelectField name="tradeIn" label="I want to" options={['Sell my car', 'Trade it in on a car from Octane Auto']} />
              <FileField name="photos" label="Photos" hint="Up to 8 photos, JPG or PNG." />
              <TextArea name="message" label="Service history, extras, finance outstanding…" rows={3} />
              <Row>
                <Field name="name" label="Full name" required autoComplete="name" />
                <Field name="phone" label="Phone" required type="tel" autoComplete="tel" />
              </Row>
              <Field name="email" label="Email" type="email" autoComplete="email" />
            </LeadForm>
          </div>
        </div>
      </section>
    </>
  );
}
