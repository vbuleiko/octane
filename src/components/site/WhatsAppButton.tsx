import { Icon } from '@/components/Icon';

export function WhatsAppButton({ number, text }: { number: string; text?: string }) {
  const href = `https://wa.me/${number.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-24 right-4 z-30 lg:bottom-5 lg:right-5 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-ink shadow-lg shadow-black/40 transition-transform hover:scale-105"
    >
      <Icon name="chat" size={26} strokeWidth={2.2} />
    </a>
  );
}
