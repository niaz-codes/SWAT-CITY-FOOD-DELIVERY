/**
 * Vehicle types a rider can register or switch between.
 *
 * Single source of truth for the labels riders recognise, the emoji shown on
 * chips, and the wire values the backend stores (`sedan` -> `car` is the only
 * remap, already applied here). Used by registration and vehicle management so
 * the two screens can never drift apart.
 */
export const VEHICLES = [
  { key: 'bike', label: 'Bike', emoji: '🛵', plateLabel: 'Bike registration number' },
  { key: 'rickshaw', label: 'Rickshaw', emoji: '🛺', plateLabel: 'Rickshaw registration number' },
  { key: 'car', label: 'Sedan', emoji: '🚗', plateLabel: 'Car registration number' },
  { key: 'van', label: 'Van', emoji: '🚐', plateLabel: 'Van registration number' },
] as const;

export type VehicleKey = (typeof VEHICLES)[number]['key'];

/** Human label for a stored vehicle type, falling back to a title-cased key. */
export function vehicleLabel(key?: string | null): string {
  if (!key) return 'Vehicle';
  const found = VEHICLES.find((v) => v.key === key);
  if (found) return found.label;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Emoji for a stored vehicle type. */
export function vehicleEmoji(key?: string | null): string {
  return VEHICLES.find((v) => v.key === key)?.emoji ?? '🛵';
}
