'use client';

import { login, type ActionState } from '@/app/admin/actions';
import { useSubmitAction } from '../useSubmitAction';

export function LoginForm() {
  const [state, onSubmit, pending] = useSubmitAction<ActionState>(login, null);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="adm-label">Email</span>
        <input name="email" type="email" required autoComplete="username" className="adm-field" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="adm-label">Password</span>
        <input name="password" type="password" required autoComplete="current-password" className="adm-field" />
      </label>
      {state && !state.ok && (
        <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="adm-btn adm-btn-primary mt-1 min-h-11">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
