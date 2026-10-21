// height_cm/weight_kg are the only values the API ever sees (backend stays
// metric — see backend/app/db/models.py) — ft/in/lb are a display-only
// mode for a US audience unlikely to know their stats in cm/kg offhand.
// Which one a user sees is their saved `unit_system` (docs/adr/0026).
import { UnitSystem } from './api';

const CM_PER_INCH = 2.54;
export const KG_PER_LB = 0.45359237;

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);
  // Rounding inches up to 12 rolls into the next foot (e.g. 5'11.6" -> 6'0").
  return inches === 12 ? { feet: feet + 1, inches: 0 } : { feet, inches };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * CM_PER_INCH);
}

export function kgToLb(kg: number): number {
  return Math.round(kg / KG_PER_LB);
}

export function lbToKg(lb: number): number {
  return Math.round(lb * KG_PER_LB * 10) / 10;
}

// One decimal place either way: daily weigh-ins move by fractions.
export function weightIn(kg: number, system: UnitSystem): number {
  return Math.round((system === 'imperial' ? kg / KG_PER_LB : kg) * 10) / 10;
}

export function weightToKg(value: number, system: UnitSystem): number {
  return system === 'imperial' ? value * KG_PER_LB : value;
}

export function weightUnit(system: UnitSystem): string {
  return system === 'imperial' ? 'lb' : 'kg';
}
