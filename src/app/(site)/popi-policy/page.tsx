import type { Metadata } from 'next';
import { PageHero } from '@/components/site/sections';
import { getSettings } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'POPI Policy',
  description: 'How Octane Auto collects, uses and protects your personal information under the Protection of Personal Information Act (POPIA).',
};

export default function PopiPage() {
  const s = getSettings();
  const sections: [string, React.ReactNode][] = [
    ['Who we are', <>Octane Auto, {s.address}, is the responsible party for personal information collected through this website. You can reach us at {s.phone} or {s.email}.</>],
    [
      'What we collect',
      <>
        When you complete a form we collect the details you give us: your name, phone number, email address and message, and, depending on the form, details of the vehicle you are interested in, your vehicle&apos;s details and photos (sell / trade-in), or workshop requirements. Online finance applications are completed on our finance partner&apos;s secure platform and are subject to their privacy policy.
      </>,
    ],
    ['Why we collect it', <>To respond to your enquiry, arrange viewings and test drives, prepare finance applications and quotations, provide workshop services, and meet our legal obligations. We only contact you about the request you made unless you ask us to keep you updated.</>],
    ['Who we share it with', <>With banks and finance houses when you ask us to submit a finance application, with insurers or warranty providers you choose to use, and with service providers who host and run this website on our behalf. We never sell your personal information.</>],
    ['How long we keep it', <>Only as long as needed for the purpose it was collected for, or as required by law, after which it is deleted or de-identified.</>],
    ['How we protect it', <>Information is stored on secured servers, access is limited to authorised staff, and connections to this website are encrypted.</>],
    ['Cookies', <>This website only uses cookies that are needed for it to work, such as keeping our staff signed in to the admin area. We do not use advertising cookies.</>],
    [
      'Your rights',
      <>
        You may ask what personal information we hold about you, ask us to correct or delete it, or object to us processing it, by contacting {s.email}. If you are unhappy with how we handled your request you may complain to the Information Regulator (South Africa) at{' '}
        <a className="text-octane underline" href="https://inforegulator.org.za" target="_blank" rel="noopener">
          inforegulator.org.za
        </a>
        .
      </>,
    ],
  ];
  return (
    <>
      <PageHero eyebrow="Protection of Personal Information Act" title="POPI" accent="policy" />
      <section className="container-pit py-16">
        <div className="grid max-w-3xl gap-10">
          {sections.map(([title, body]) => (
            <div key={title}>
              <h2 className="display mb-3 text-3xl">{title}</h2>
              <p className="text-[17px] leading-relaxed text-smoke">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
