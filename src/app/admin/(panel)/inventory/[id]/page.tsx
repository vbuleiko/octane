import { notFound } from 'next/navigation';
import { VehicleForm } from '@/components/admin/VehicleForm';
import { knownMakes } from '@/lib/admin-data';
import { getSettings } from '@/lib/settings';
import { getVehicleById } from '@/lib/vehicles';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const v = getVehicleById(Number((await params).id));
  return { title: v ? `${v.year} ${v.make} ${v.model}` : 'Vehicle' };
}

export default async function EditVehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const vehicle = getVehicleById(Number((await params).id));
  if (!vehicle) notFound();
  const { created } = await searchParams;
  const s = getSettings();
  return (
    <VehicleForm
      key={vehicle.id}
      vehicle={vehicle}
      makes={knownMakes()}
      finance={{ rate: s.financeRate, term: s.financeTerm }}
      standardFooter={s.standardFooter}
      created={!!created}
    />
  );
}
