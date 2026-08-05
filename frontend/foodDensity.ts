// Coarse density heuristic that turns a gram count into something you can
// picture. Grams don't map to volume — 100g of lettuce is a huge pile, 100g
// of rice or chicken is a small dense one — so "180g" alone doesn't tell you
// how big a portion actually looks. These are rough educational multipliers
// (mL of visual volume per gram), not lab density figures, and must never
// feed into calorie/macro math or the recommendation engine.
// Mirrors the keyword-matching structure in foodColors.ts.

type DensityRule = { keywords: string[]; factor: number };

const DENSITY_RULES: DensityRule[] = [
  { keywords: ['salad', 'greens', 'spinach', 'kale', 'arugula', 'slaw'], factor: 4.5 },
  { keywords: ['bread', 'roll', 'bagel', 'toast', 'tortilla', 'wrap', 'naan', 'pita'], factor: 2.2 },
  { keywords: ['broccoli', 'vegetable', 'veggie', 'pepper', 'zucchini', 'squash', 'asparagus', 'green bean', 'carrot', 'tomato', 'corn'], factor: 1.8 },
  { keywords: ['potato', 'fries'], factor: 1.4 },
  { keywords: ['rice', 'quinoa', 'grain', 'couscous'], factor: 1.3 },
  { keywords: ['pasta', 'noodle', 'spaghetti', 'penne', 'mac'], factor: 1.25 },
  { keywords: ['bean', 'lentil', 'chickpea'], factor: 1.1 },
  { keywords: ['fruit', 'apple', 'berry', 'banana', 'melon', 'grape', 'pineapple', 'mango', 'orange'], factor: 1.1 },
  { keywords: ['soup', 'bisque', 'chowder', 'broth', 'stew'], factor: 1.0 },
  { keywords: ['sauce', 'gravy', 'dressing', 'aioli'], factor: 1.0 },
  {
    keywords: [
      'beef', 'steak', 'burger', 'meatball', 'meatloaf', 'pork', 'bacon', 'ham', 'sausage',
      'chicken', 'turkey', 'poultry', 'salmon', 'fish', 'tuna', 'shrimp', 'seafood', 'cod',
      'tofu', 'tempeh', 'seitan', 'egg',
    ],
    factor: 1.0,
  },
  { keywords: ['cheese'], factor: 0.95 },
];

// Mild bulk bias for unmatched items — err toward visible rather than vanishing.
const DEFAULT_FACTOR = 1.2;

/** mL of visual volume represented by one gram of this item. */
export function relativeVolume(item: { name: string }): number {
  const lower = item.name.toLowerCase();
  for (const rule of DENSITY_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule.factor;
  }
  return DEFAULT_FACTOR;
}

const CUP_ML = 236.6;
const TBSP_ML = 14.79;

function formatQuarters(n: number): string {
  const rounded = Math.round(n * 4) / 4;
  const whole = Math.floor(rounded);
  const frac = +(rounded - whole).toFixed(2);
  const glyph = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
  if (whole === 0) return glyph || '0';
  return glyph ? `${whole}${glyph}` : `${whole}`;
}

function formatHalves(n: number): string {
  const rounded = Math.round(n * 2) / 2;
  const whole = Math.floor(rounded);
  const half = rounded - whole === 0.5;
  if (whole === 0) return half ? '½' : '0';
  return half ? `${whole}½` : `${whole}`;
}

/**
 * A plain-language volume estimate ("≈ 1¼ cups", "≈ 1 tbsp") derived from the
 * same density heuristic as relativeVolume — the point isn't the exact figure,
 * it's translating an abstract gram count into something you can actually
 * picture, since grams alone don't tell you how big a portion looks.
 */
export function describePortion(item: { name: string; grams: number }): string {
  if (item.grams <= 0) return '';
  const mL = item.grams * relativeVolume(item);
  if (mL < CUP_ML * 0.2) {
    const tbsp = Math.max(0.5, mL / TBSP_ML);
    return `≈ ${formatHalves(tbsp)} tbsp`;
  }
  const cups = mL / CUP_ML;
  return `≈ ${formatQuarters(cups)} cup${cups > 1 ? 's' : ''}`;
}
