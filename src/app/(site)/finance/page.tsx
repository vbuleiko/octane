import type { Metadata } from 'next';
import { Icon } from '@/components/Icon';
import { FinanceCalculator } from '@/components/site/FinanceCalculator';
import { Field, LeadForm, Row, SelectField, TextArea } from '@/components/site/forms';
import { PageHero } from '@/components/site/sections';
import { SkewA } from '@/components/site/SkewLink';
import { getSettings } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Vehicle finance & insurance',
  description: 'Apply for vehicle finance at Octane Auto. We submit to all major South African banks. Finance calculator, online application and application forms.',
};

export default function FinancePage() {
  const s = getSettings();
  return (
    <>
      <PageHero eyebrow="Finance & insurance" title="Drive now," accent="pay monthly">
        At Octane Auto we make finance easy: one application, submitted to all major banks, so you get the best rate available.
      </PageHero>

      <section className="container-pit grid gap-4 py-16 md:grid-cols-3">
        {[
          { icon: 'external' as const, title: 'Apply online', text: 'The fastest route. Complete the secure online application in about 10 minutes.', href: s.financeApplyUrl, cta: 'Start application', external: true },
          { icon: 'download' as const, title: 'Individual form', text: 'Prefer paper? Download the application form, fill it in and email it back to us.', href: '/documents/octane-finance-individual.pdf', cta: 'Download PDF' },
          { icon: 'download' as const, title: 'Company form', text: 'Buying through a business, trust or close corporation? Use the juristic application.', href: '/documents/octane-finance-juristic.pdf', cta: 'Download PDF' },
        ].map((c) => (
          <a
            key={c.title}
            href={c.href}
            target={c.external ? '_blank' : undefined}
            rel={c.external ? 'noopener' : undefined}
            className="group flex flex-col gap-4 bg-panel p-7 transition-colors hover:bg-octane hover:text-ink"
          >
            <Icon name={c.icon} size={30} className="text-octane group-hover:text-ink" />
            <h2 className="display text-3xl">{c.title}</h2>
            <p className="text-smoke group-hover:text-ink">{c.text}</p>
            <span className="racing mt-auto text-[15px]">{c.cta} →</span>
          </a>
        ))}
      </section>

      <section className="container-pit flex flex-wrap items-start gap-10 pb-16">
        <div className="min-w-0 flex-[1_1_380px]">
          <h2 className="display mb-5 text-[clamp(44px,6vw,84px)]">
            Run the <span className="text-octane">numbers</span>
          </h2>
          <p className="mb-8 max-w-md text-[17px] leading-relaxed text-smoke">
            Rates from 9% to 20% and terms from 12 to 72 months. A balloon payment lowers your instalment but leaves a lump sum at the end.
          </p>
          <h3 className="racing mb-3 text-lg tracking-normal">What you&apos;ll usually need</h3>
          <ul className="grid gap-2.5 text-smoke">
            {['Copy of your ID', "Valid driver's licence", 'Latest 3 months’ payslips', 'Latest 3 months’ bank statements', 'Proof of residence'].map((x) => (
              <li key={x} className="flex items-center gap-3">
                <Icon name="check" size={18} strokeWidth={3} className="text-octane" /> {x}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 flex-[1_1_560px]">
          <FinanceCalculator rate={s.financeRate} term={s.financeTerm} />
        </div>
      </section>

      <section className="bg-pit">
        <div className="container-pit flex flex-wrap gap-10 py-20">
          <div className="min-w-0 flex-[1_1_360px]">
            <h2 className="display mb-4 text-[clamp(40px,5vw,68px)]">
              Rather <span className="text-octane">talk to us?</span>
            </h2>
            <p className="mb-6 max-w-md text-smoke">
              Leave your details and our finance team will call you to talk through budget, deposit and the best bank options. We can also arrange insurance and extended warranties.
            </p>
            <SkewA href={`tel:${s.phone.replace(/\D/g, '')}`} variant="ghost">
              <Icon name="phone" size={16} strokeWidth={2.4} /> {s.phone}
            </SkewA>
          </div>
          <div className="min-w-0 flex-[1_1_520px]">
            <LeadForm type="finance" submitLabel="Request a call back">
              <Row>
                <Field name="name" label="Full name" required autoComplete="name" />
                <Field name="phone" label="Phone" required type="tel" autoComplete="tel" />
              </Row>
              <Row>
                <Field name="email" label="Email" type="email" autoComplete="email" />
                <Field name="vehicle" label="Car you're interested in" placeholder="e.g. BMW X3 or stock no." />
              </Row>
              <Row>
                <SelectField name="employment" label="Employment" placeholder="Select" options={['Permanently employed', 'Self-employed', 'Contract', 'Pensioner', 'Other']} />
                <SelectField name="deposit" label="Deposit available" placeholder="Select" options={['No deposit', 'Up to R 20 000', 'R 20 000 – R 50 000', 'R 50 000 – R 100 000', 'More than R 100 000', 'Trade-in']} />
              </Row>
              <TextArea name="message" label="Anything else we should know?" rows={3} />
            </LeadForm>
          </div>
        </div>
      </section>
    </>
  );
}
