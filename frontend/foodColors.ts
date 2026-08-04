// A wide, visually distinct palette. Semantic rules below map common dining-hall
// foods to a "sensible" color from this set (e.g. greens for veggies, red for beef).
// Anything unmatched falls back to a stable hash of the food name.
const PALETTE = [
  '#dc2626', // red — tomato, beef
  '#f97316', // orange — carrot, soup
  '#b45309', // amber-brown — chicken, bread
  '#eab308', // yellow — pasta, corn
  '#facc15', // bright yellow — cheese
  '#fde047', // pale yellow — egg
  '#84cc16', // lime
  '#22c55e', // green — salad, vegetables
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia — fruit
  '#ec4899', // pink — salmon, fish
  '#f43f5e', // rose — pork, ham
  '#991b1b', // maroon — red meat
  '#78350f', // dark brown — beans, lentils
  '#a16207', // tan/gold — rice, grain
  '#ca8a04', // dark gold — potato, fries
  '#57534e', // stone — sauces, gravy
  '#0d9488', // teal-600
];

type SemanticRule = { keywords: string[]; color: string };

const SEMANTIC_RULES: SemanticRule[] = [
  { keywords: ['salad', 'greens', 'spinach', 'kale', 'arugula', 'slaw'], color: '#22c55e' },
  { keywords: ['soup', 'bisque', 'chowder', 'broth', 'stew'], color: '#a16207' },
  { keywords: ['beef', 'steak', 'burger', 'meatball', 'meatloaf'], color: '#991b1b' },
  { keywords: ['pork', 'bacon', 'ham', 'sausage'], color: '#f43f5e' },
  { keywords: ['chicken', 'turkey', 'poultry'], color: '#b45309' },
  { keywords: ['salmon', 'fish', 'tuna', 'shrimp', 'seafood', 'cod'], color: '#ec4899' },
  { keywords: ['tofu', 'tempeh', 'seitan'], color: '#fde047' },
  { keywords: ['egg'], color: '#facc15' },
  { keywords: ['cheese'], color: '#eab308' },
  { keywords: ['pasta', 'noodle', 'spaghetti', 'penne', 'mac'], color: '#facc15' },
  { keywords: ['rice', 'quinoa', 'grain', 'couscous'], color: '#a16207' },
  { keywords: ['potato', 'fries'], color: '#ca8a04' },
  { keywords: ['bean', 'lentil', 'chickpea', 'tofu'], color: '#78350f' },
  { keywords: ['broccoli', 'vegetable', 'veggie', 'pepper', 'zucchini', 'squash', 'asparagus', 'green bean'], color: '#22c55e' },
  { keywords: ['carrot'], color: '#f97316' },
  { keywords: ['tomato'], color: '#dc2626' },
  { keywords: ['corn'], color: '#eab308' },
  { keywords: ['bread', 'roll', 'bagel', 'toast', 'tortilla', 'wrap', 'naan', 'pita'], color: '#b45309' },
  { keywords: ['fruit', 'apple', 'berry', 'banana', 'melon', 'grape', 'pineapple', 'mango', 'orange'], color: '#d946ef' },
  { keywords: ['sauce', 'gravy', 'dressing', 'aioli'], color: '#57534e' },
];

function hashIndex(name: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % mod;
}

function preferredColorIndex(name: string): number {
  const lower = name.toLowerCase();
  for (const rule of SEMANTIC_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) {
      const idx = PALETTE.indexOf(rule.color);
      if (idx !== -1) return idx;
    }
  }
  return hashIndex(name, PALETTE.length);
}

/**
 * Assigns each item a color from PALETTE, using semantic food-type matching
 * (e.g. beef -> red, salad -> green) with no two items in the same call
 * ever sharing a color — collisions probe forward to the next free slot.
 */
export function assignPlateColors(items: { name: string }[]): Record<string, string> {
  const colors: Record<string, string> = {};
  const used = new Set<number>();

  for (const item of items) {
    if (colors[item.name]) continue; // duplicate item name in the same list
    let idx = preferredColorIndex(item.name);
    let attempts = 0;
    while (used.has(idx) && attempts < PALETTE.length) {
      idx = (idx + 1) % PALETTE.length;
      attempts++;
    }
    used.add(idx);
    colors[item.name] = PALETTE[idx];
  }

  return colors;
}
