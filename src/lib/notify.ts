import nodemailer from 'nodemailer';

/**
 * Emails the dealership about a new lead when SMTP_URL is configured
 * (e.g. smtps://user:pass@smtp.example.com:465). Without it, leads are only stored in the admin.
 */
export async function notifyNewLead(to: string, subject: string, lines: [string, string][]) {
  const url = process.env.SMTP_URL;
  if (!url || !to) return;
  try {
    const transport = nodemailer.createTransport(url);
    const text = lines.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
    await transport.sendMail({
      from: process.env.SMTP_FROM || `Octane Auto website <${to}>`,
      to,
      subject,
      text: `${text}\n\nOpen the admin to reply: ${process.env.SITE_URL || ''}/admin/leads`,
    });
  } catch (err) {
    console.error('Lead notification failed', err);
  }
}
