'use client';

import { useState } from 'react';
import { changePassword, runVmgSync, saveSettingsAction, type ActionState } from '@/app/admin/actions';
import { Icon } from '@/components/Icon';
import type { Settings } from '@/lib/settings';
import { useSubmitAction } from '../useSubmitAction';

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <span role="status" className={`text-sm ${state.ok ? 'text-ok' : 'text-bad'}`}>
      {state.message}
    </span>
  );
}

function Input({ name, label, defaultValue, hint, ...rest }: { name: string; label: string; defaultValue?: string | number; hint?: string } & React.ComponentProps<'input'>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="adm-label">{label}</span>
      <input name={name} defaultValue={defaultValue} className="adm-field" {...rest} />
      {hint && <span className="text-xs text-[#71717a]">{hint}</span>}
    </label>
  );
}

export function SettingsForm({ settings, vehicles }: { settings: Settings; vehicles: { stockCode: string; label: string }[] }) {
  const [state, onSubmit, pending] = useSubmitAction<ActionState>(saveSettingsAction, null);
  const [hours, setHours] = useState(settings.hours);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <section className="adm-card flex flex-col gap-4 p-5">
        <h2 className="text-base font-bold">Contact details</h2>
        <div className="grid gap-3.5 md:grid-cols-2">
          <Input name="phone" label="Phone" defaultValue={settings.phone} />
          <Input name="email" label="Email — also receives lead notifications" type="email" defaultValue={settings.email} />
          <Input name="whatsapp" label="WhatsApp number" defaultValue={settings.whatsapp} placeholder="e.g. 27821234567" hint="International format. Leave empty to hide the WhatsApp button." />
          <Input name="mapUrl" label="Google Maps link" defaultValue={settings.mapUrl} />
          <Input name="address" label="Showroom address" defaultValue={settings.address} />
          <Input name="workshopAddress" label="Workshop address" defaultValue={settings.workshopAddress} />
        </div>
      </section>

      <section className="adm-card flex flex-col gap-4 p-5">
        <h2 className="text-base font-bold">Trading hours</h2>
        <div className="flex flex-col gap-2">
          {hours.map((h, i) => (
            <div key={i} className="flex gap-2">
              <input name="hoursLabel" defaultValue={h.label} aria-label="Days" className="adm-field max-w-56" />
              <input name="hoursValue" defaultValue={h.value} aria-label="Hours" className="adm-field max-w-56" />
              <button type="button" onClick={() => setHours((list) => list.filter((_, j) => j !== i))} aria-label="Remove row" className="adm-btn adm-btn-ghost w-11 px-0">
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setHours((list) => [...list, { label: '', value: '' }])} className="adm-btn adm-btn-ghost w-fit">
            <Icon name="plus" size={16} /> Add row
          </button>
        </div>
      </section>

      <section className="adm-card flex flex-col gap-4 p-5">
        <h2 className="text-base font-bold">Homepage &amp; listings</h2>
        <div className="grid gap-3.5 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="adm-label">Car of the week (homepage hero)</span>
            <select name="heroStockCode" defaultValue={settings.heroStockCode} className="adm-field cursor-pointer">
              <option value="">Automatic — newest featured car</option>
              {vehicles.map((v) => (
                <option key={v.stockCode} value={v.stockCode}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <Input name="tickerExtra" label="Extra text in the orange ticker" defaultValue={settings.tickerExtra} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="adm-label">Standard footer added to car descriptions</span>
          <textarea name="standardFooter" defaultValue={settings.standardFooter} rows={4} className="adm-field resize-y py-2.5" />
        </label>
      </section>

      <section className="adm-card flex flex-col gap-4 p-5">
        <h2 className="text-base font-bold">Finance</h2>
        <div className="grid gap-3.5 md:grid-cols-3">
          <Input name="financeRate" label="Default interest rate (%)" type="number" step="0.25" min="0" max="40" defaultValue={settings.financeRate} />
          <label className="flex flex-col gap-1.5">
            <span className="adm-label">Default term</span>
            <select name="financeTerm" defaultValue={settings.financeTerm} className="adm-field cursor-pointer">
              {[12, 24, 36, 48, 54, 60, 72].map((t) => (
                <option key={t} value={t}>
                  {t} months
                </option>
              ))}
            </select>
          </label>
          <Input name="financeApplyUrl" label="Online application link" defaultValue={settings.financeApplyUrl} />
        </div>
        <p className="text-[12.5px] text-[#8e8e96]">Used for the “≈ R … pm” estimates on every car and as the calculator&apos;s starting point.</p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="adm-btn adm-btn-primary">
          {pending ? 'Saving…' : 'Save settings'}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function SyncForm({ last }: { last: Settings['lastSync'] }) {
  const [state, onSubmit, pending] = useSubmitAction<ActionState>(runVmgSync, null);
  return (
    <form id="sync" onSubmit={onSubmit} className="adm-card flex scroll-mt-6 flex-col gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">VMG stock sync</h2>
        {last && <span className="text-[13px] text-[#8e8e96]">Last run {new Date(last.at).toLocaleString('en-ZA')}</span>}
      </div>
      <p className="text-[14px] leading-relaxed text-[#a1a1aa]">
        Imports Octane Auto&apos;s stock from the VMG Software feed that runs the current website: new cars are added with all photos, prices and mileage are refreshed. Descriptions,
        extras, featured flags and anything you add here are left untouched.
      </p>
      <label className="flex items-center gap-2.5 text-[14px]">
        <input type="checkbox" name="markSold" defaultChecked className="size-4" />
        Mark cars that are no longer in the VMG feed as sold
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="adm-btn adm-btn-ghost">
          <Icon name="refresh" size={16} className={pending ? 'animate-spin' : ''} /> {pending ? 'Syncing… (about a minute)' : 'Sync now'}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, onSubmit, pending] = useSubmitAction<ActionState>(changePassword, null);
  return (
    <form onSubmit={onSubmit} className="adm-card flex flex-col gap-4 p-5">
      <h2 className="text-base font-bold">Change password</h2>
      <div className="grid gap-3.5 md:grid-cols-2">
        <Input name="current" label="Current password" type="password" autoComplete="current-password" required />
        <Input name="next" label="New password (8+ characters)" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="adm-btn adm-btn-ghost">
          Update password
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}
