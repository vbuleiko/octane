import type { Metadata } from 'next';
import { Icon } from '@/components/Icon';
import { Field, LeadForm, Row, TextArea } from '@/components/site/forms';
import { PageHero } from '@/components/site/sections';
import { getSettings, phoneHref } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Contact Octane Auto: 021 891 3342, Unit 6, 3 Esso Rd, Montague Gardens, Cape Town. Trading hours and enquiry form.',
};

export default function ContactPage() {
  const s = getSettings();
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent('Octane Auto, ' + s.address)}&output=embed`;
  return (
    <>
      <PageHero eyebrow="Contact" title="Get in" accent="touch">
        Complaints, compliments or questions: call, email, visit or use the form and we&apos;ll respond as soon as possible.
      </PageHero>

      <section className="container-pit grid gap-4 py-16 md:grid-cols-3">
        <a href={phoneHref(s.phone)} className="group flex flex-col gap-3 bg-panel p-7 hover:bg-octane hover:text-ink">
          <Icon name="phone" size={28} className="text-octane group-hover:text-ink" />
          <span className="label-caps group-hover:text-ink">Call us</span>
          <span className="display text-4xl">{s.phone}</span>
        </a>
        <a href={`mailto:${s.email}`} className="group flex flex-col gap-3 bg-panel p-7 hover:bg-octane hover:text-ink">
          <Icon name="mail" size={28} className="text-octane group-hover:text-ink" />
          <span className="label-caps group-hover:text-ink">Email</span>
          <span className="racing break-all text-2xl tracking-normal">{s.email}</span>
        </a>
        <div className="flex flex-col gap-3 bg-panel p-7">
          <Icon name="clock" size={28} className="text-octane" />
          <span className="label-caps">Trading hours</span>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
            {s.hours.map((h) => (
              <div key={h.label} className="contents">
                <dt className="text-ash">{h.label}</dt>
                <dd className="font-semibold">{h.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="container-pit flex flex-wrap gap-10 pb-20">
        <div className="min-w-0 flex-[1_1_480px]">
          <h2 className="display mb-6 text-[clamp(40px,5vw,68px)]">
            Send a <span className="text-octane">message</span>
          </h2>
          <LeadForm type="contact" submitLabel="Submit enquiry">
            <Field name="name" label="Full name" required autoComplete="name" />
            <Row>
              <Field name="phone" label="Contact number" required type="tel" autoComplete="tel" />
              <Field name="email" label="Email address" required type="email" autoComplete="email" />
            </Row>
            <TextArea name="message" label="Message" rows={5} />
          </LeadForm>
        </div>
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden border border-line bg-panel">
            <iframe
              title="Map to Octane Auto"
              src={mapSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 h-full w-full grayscale invert-[0.92] hue-rotate-180"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 bg-panel p-5">
            <div>
              <div className="label-caps mb-1">Showroom</div>
              <p className="font-semibold">{s.address}</p>
              <div className="label-caps mb-1 mt-3">Workshop</div>
              <p className="font-semibold">{s.workshopAddress}</p>
            </div>
            <a href={s.mapUrl} target="_blank" rel="noopener" className="racing flex items-center gap-2 text-octane hover:text-octane-hot">
              Open in Maps <Icon name="external" size={16} />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
