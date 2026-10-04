import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/admin/LoginForm';
import { getSession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Admin sign in', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSession()) redirect('/admin');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink px-4">
      <div className="checker fixed inset-x-0 top-0 h-6 [--checker-size:24px]" aria-hidden="true" />
      <div className="adm-card w-full max-w-sm p-7">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/brand/logo-circle.png" alt="Octane Auto" width={48} height={48} />
          <div>
            <h1 className="text-lg font-bold">Octane Admin</h1>
            <p className="text-sm text-ash">Sign in to manage stock and leads</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
