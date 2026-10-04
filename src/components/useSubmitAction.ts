'use client';

import { startTransition, useActionState } from 'react';

/**
 * Like useActionState, but submits via onSubmit so React doesn't reset the form afterwards —
 * people keep what they typed when the server returns a validation error.
 */
export function useSubmitAction<S>(fn: (prev: Awaited<S>, form: FormData) => Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(fn, initial);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const form = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(form));
  };
  return [state, onSubmit, pending] as const;
}
