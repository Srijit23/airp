import { roads } from './layout.js';
export const signs = [
  ...new Set(roads.map((r) => r.name)),
  'ORCHARD CIRCLE',
  'SOUTH PASS  ↗',
  'CITY CENTRE  ↑',
  'KEEP LEFT',
  'P  /  PARKING',
  '‹  ‹  ‹',
  '›  ›  ›',
];
export const signKind = (name) => 10 + signs.indexOf(name);
