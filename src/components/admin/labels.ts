import type { LeadType } from '@/lib/db/schema';

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  enquiry: 'Vehicle enquiry',
  finance: 'Finance',
  workshop: 'Workshop',
  tradein: 'Sell / trade-in',
  contact: 'Contact form',
};

export const BODY_TYPES = ['SUV', 'Hatchback', 'Sedan', 'Bakkie', 'Coupé', 'Cabriolet', 'MPV', 'Station wagon', 'Van'];
export const FUEL_TYPES = ['Petrol', 'Diesel', 'Hybrid', 'Electric'];
export const TRANSMISSIONS = ['Automatic', 'Manual'];
export const CONDITIONS = ['Excellent', 'Very good', 'Good', 'Fair'];

/** Common extras offered as one-click chips, based on the options used in Octane Auto's listings. */
export const COMMON_EXTRAS = [
  'ABS Brakes',
  'Airbags',
  'Air Conditioning',
  'Alarm',
  'All Wheel Drive',
  'Alloy Wheels',
  'Auto Dim Rear View Mirror',
  'Automatic Start Stop',
  'Bluetooth Ready',
  'Central Locking',
  'Climate Control',
  'Cruise Control',
  'EBD Electronic Brake Distribution',
  'Electric Memory Seats',
  'Electric Mirrors',
  'Electric Seats',
  'Electric Windows',
  'ESP Electronic Stability Program',
  'Fog Lights',
  'Full House',
  'Full Service History',
  'Full Spare Wheel',
  'Immobilizer',
  'Keyless Go',
  'LED Daytime Lights',
  'Leather',
  'Multi-Function Steering',
  'Panoramic Roof',
  'Parking Sensors',
  'Power Steering',
  'Rain Sensor',
  'Rear View Camera',
  'Sat Nav',
  'Sunroof',
  'Tinted Windows',
  'Towbar',
  'Traction Control',
  'Trip Computer',
  'Tyre Pressure Monitor',
  'USB Input',
  'Xenon Headlights',
];
