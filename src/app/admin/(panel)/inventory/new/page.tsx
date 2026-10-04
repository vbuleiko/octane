import { VehicleForm } from '@/components/admin/VehicleForm';
import { knownMakes } from '@/lib/admin-data';
import { getSettings } from '@/lib/settings';

export const metadata = { title: 'Add vehicle' };

export default function NewVehiclePage() {
  const s = getSettings();
  return <VehicleForm vehicle={null} makes={knownMakes()} finance={{ rate: s.financeRate, term: s.financeTerm }} standardFooter={s.standardFooter} />;
}
