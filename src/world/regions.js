export const shoreline = x => 3508 + 140 * Math.sin(x / 710) + 50 * Math.sin(x / 211);
export function regionAt(x, z) {
  if (z > shoreline(x)) return 'South Sound';
  if (z > shoreline(x) - 180) return 'Saltwood Strand';
  if (z > 2630 && x > -840 && x < 650) return 'Port Mariner';
  if (z > 1370 && z < 2030 && Math.abs(x) < 730) return 'Alder Vale';
  if (z < -1240 || x < -1420) return 'Silverpine Forest';
  if (x > 1200) return 'East Escarpment';
  if (Math.max(Math.abs(x), Math.abs(z)) < 1024) return 'Kestrel Basin';
  return 'South Pass';
}
