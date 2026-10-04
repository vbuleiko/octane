import { PasswordForm, SettingsForm, SyncForm } from '@/components/admin/SettingsForms';
import { Body, PageHeader } from '@/components/admin/ui';
import { getSettings } from '@/lib/settings';
import { publicVehicles } from '@/lib/vehicles';

export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  const settings = getSettings();
  const vehicles = publicVehicles().map((v) => ({ stockCode: v.stockCode, label: `${v.stockCode} · ${v.year} ${v.make} ${v.model}` }));
  return (
    <>
      <PageHeader title="Settings" subtitle="Contact details, hours, finance defaults and stock sync" />
      <Body>
        <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]">
          <SettingsForm settings={settings} vehicles={vehicles} />
          <div className="flex flex-col gap-5 xl:sticky xl:top-6">
            <SyncForm last={settings.lastSync} />
            <PasswordForm />
          </div>
        </div>
      </Body>
    </>
  );
}
