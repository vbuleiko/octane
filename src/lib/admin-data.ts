import { db, schema } from './db';

export function knownMakes() {
  const rows = db.selectDistinct({ make: schema.vehicles.make }).from(schema.vehicles).all();
  const base = ['Audi', 'BMW', 'Chevrolet', 'Ford', 'Haval', 'Honda', 'Hyundai', 'Jaguar', 'Kia', 'Land Rover', 'Mazda', 'Mercedes-Benz', 'MINI', 'Nissan', 'Renault', 'Suzuki', 'Toyota', 'Volkswagen', 'Volvo'];
  return [...new Set([...base, ...rows.map((r) => r.make)])].sort((a, b) => a.localeCompare(b));
}
