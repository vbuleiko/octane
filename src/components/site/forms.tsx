'use client';

import { createContext, useContext, useId } from 'react';
import { submitLead, type FormState } from '@/app/actions/leads';
import { Icon } from '@/components/Icon';
import type { LeadType } from '@/lib/db/schema';
import { useSubmitAction } from '../useSubmitAction';
import { SkewButton } from './SkewLink';

const ErrorsContext = createContext<Record<string, string>>({});

export function LeadForm({
  type,
  vehicleId,
  submitLabel = 'Send',
  className = '',
  children,
}: {
  type: LeadType;
  vehicleId?: number;
  submitLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, onSubmit, pending] = useSubmitAction<FormState>(submitLead, null);

  if (state?.ok) {
    return (
      <div role="status" className="flex flex-col items-start gap-4 border-l-4 border-octane bg-panel p-6 sm:p-8">
        <span className="flex size-12 items-center justify-center bg-octane text-ink">
          <Icon name="check" size={26} strokeWidth={3} />
        </span>
        <h3 className="display text-4xl">Message received</h3>
        <p className="text-smoke">{state.message}</p>
      </div>
    );
  }

  return (
    <ErrorsContext.Provider value={state?.errors ?? {}}>
      <form onSubmit={onSubmit} className={`flex flex-col gap-4 ${className}`} noValidate>
        <input type="hidden" name="type" value={type} />
        {vehicleId && <input type="hidden" name="vehicleId" value={vehicleId} />}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Company <input type="text" name="company" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        {children}
        {state && !state.ok && (
          <p role="alert" className="border-l-4 border-bad bg-bad/10 px-4 py-3 text-sm text-chalk">
            {state.message}
          </p>
        )}
        <div className="pl-2 pt-1">
          <SkewButton type="submit" disabled={pending} className="min-h-14 px-9 text-lg">
            {pending ? 'Sending…' : submitLabel}
          </SkewButton>
        </div>
        <p className="text-xs text-ash">
          By submitting you agree that Octane Auto may contact you about your request, as described in our{' '}
          <a href="/popi-policy" className="underline hover:text-chalk">
            POPI policy
          </a>
          .
        </p>
      </form>
    </ErrorsContext.Provider>
  );
}

function useFieldError(name: string) {
  return useContext(ErrorsContext)[name];
}

function Label({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="label-caps">
      {children}
      {required && <span className="text-octane"> *</span>}
    </label>
  );
}

function ErrorText({ id, error }: { id: string; error?: string }) {
  return error ? (
    <span id={id} className="text-sm text-bad">
      {error}
    </span>
  ) : null;
}

export function Field({
  name,
  label,
  required,
  type = 'text',
  ...rest
}: { name: string; label: string; required?: boolean; type?: string } & Omit<React.ComponentProps<'input'>, 'name' | 'type'>) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`field ${error ? 'border-bad' : ''}`}
        {...rest}
      />
      <ErrorText id={`${id}-err`} error={error} />
    </div>
  );
}

export function TextArea({ name, label, required, ...rest }: { name: string; label: string; required?: boolean } & Omit<React.ComponentProps<'textarea'>, 'name'>) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <textarea id={id} name={name} rows={4} aria-invalid={error ? true : undefined} className="field resize-y py-3 leading-relaxed" {...rest} />
      <ErrorText id={`${id}-err`} error={error} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  options,
  placeholder,
  ...rest
}: { name: string; label: string; options: string[]; placeholder?: string } & Omit<React.ComponentProps<'select'>, 'name'>) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={name} className="field cursor-pointer" {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CheckboxGroup({ name, legend, options }: { name: string; legend: string; options: string[] }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="label-caps mb-3">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o}
            className="racing flex min-h-11 cursor-pointer items-center gap-2.5 border-2 border-[#3a3a3e] px-4 text-[15px] has-[:checked]:border-octane has-[:checked]:bg-octane has-[:checked]:text-ink"
          >
            <input type="checkbox" name={name} value={o} className="size-4" />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FileField({ name, label, hint }: { name: string; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        name={name}
        type="file"
        accept="image/*"
        multiple
        className="field cursor-pointer py-3 file:mr-4 file:cursor-pointer file:border-0 file:bg-octane file:px-4 file:py-2 file:font-bold file:text-ink"
      />
      {hint && <span className="text-xs text-ash">{hint}</span>}
    </div>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
