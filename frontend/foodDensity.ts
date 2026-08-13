// Coarse portion-unit heuristic that turns a gram count into something you
// can picture and directly adjust — "180g" alone doesn't tell you how big a
// portion looks, but "2 scoops of rice" or "1 palm of chicken" does. Each
// food is keyword-matched to whichever everyday unit fits it (scoop, slice,
// cup, palm, piece, tbsp, or "plate" as the fallback for composite/unmatched
// dishes). These are rough educational figures (grams per unit), not lab
// portion-weight data, and must never feed into calorie/macro math or the
// recommendation engine — some fits are deliberately coarse (an egg isn't
// literally palm-sized, a block of cheese isn't literally sliced) in
// exchange for staying to a small, memorable set of units. Table was tuned
// against the actual scraped menu vocabulary (477 distinct item names across
// the 10 AYCE halls) rather than picked in the abstract.
// Mirrors the keyword-matching structure in foodColors.ts.

export type PortionUnit = 'scoop' | 'slice' | 'cup' | 'palm' | 'plate' | 'tbsp' | 'piece';

export type PortionUnitInfo = {
  unit: PortionUnit;
  gramsPerUnit: number;
  label: string;
  pluralLabel: string;
};

type UnitRule = { keywords: string[]; unit: PortionUnit; gramsPerUnit: number };

// Rule order matters (first match wins) — earlier rules are the more
// shape-defining ones (a pizza is a slice regardless of its toppings), and
// within a dish name that names multiple ingredients (e.g. "Beef &
// Broccoli"), the earlier-listed food generally wins. "piece"-unit foods are
// checked before palm/tbsp specifically so a countable item (a drumstick, a
// biscuit) isn't swallowed by a protein or condiment word also present in
// the name (e.g. "Pork Sausage Patty", "Sausage Gravy & Biscuits").
const UNIT_RULES: UnitRule[] = [
  { keywords: ['salad', 'greens', 'spinach', 'kale', 'arugula', 'slaw', 'tabbouleh', 'kimchi'], unit: 'cup', gramsPerUnit: 45 },
  { keywords: ['bread', 'roll', 'bagel', 'toast', 'tortilla', 'wrap', 'naan', 'pita', 'focaccia'], unit: 'slice', gramsPerUnit: 35 },
  { keywords: ['pizza'], unit: 'slice', gramsPerUnit: 120 },
  { keywords: ['cake', 'pie'], unit: 'slice', gramsPerUnit: 90 },
  {
    keywords: [
      'broccoli', 'vegetable', 'veggie', 'pepper', 'zucchini', 'squash', 'asparagus', 'green bean',
      'carrot', 'tomato', 'corn', 'cauliflower', 'mushroom', 'brussel', 'cabbage', ' peas',
      'cucumber', 'chard', 'lettuce', 'calabacitas', 'butternut',
    ],
    unit: 'cup',
    gramsPerUnit: 130,
  },
  { keywords: ['potato', 'fries'], unit: 'scoop', gramsPerUnit: 100 },
  { keywords: ['rice', 'quinoa', 'grain', 'couscous', 'barley', 'polenta'], unit: 'scoop', gramsPerUnit: 95 },
  { keywords: ['ice cream'], unit: 'scoop', gramsPerUnit: 65 },
  { keywords: ['pasta', 'noodle', 'spaghetti', 'penne', 'mac'], unit: 'scoop', gramsPerUnit: 110 },
  { keywords: ['bean', 'lentil', 'chickpea', 'edamame'], unit: 'scoop', gramsPerUnit: 85 },
  {
    keywords: ['fruit', 'apple', 'berry', 'banana', 'melon', 'grape', 'pineapple', 'mango', 'orange', 'peach'],
    unit: 'cup',
    gramsPerUnit: 145,
  },
  {
    keywords: [
      'soup', 'bisque', 'chowder', 'broth', 'stew', 'cereal', 'oatmeal', 'grits', 'porridge',
      'bowl', 'pudding', 'borscht', 'beverage', 'water', 'yogurt',
    ],
    unit: 'cup',
    gramsPerUnit: 240,
  },
  { keywords: ['nugget'], unit: 'piece', gramsPerUnit: 20 },
  { keywords: ['drumstick'], unit: 'piece', gramsPerUnit: 90 },
  { keywords: ['patty'], unit: 'piece', gramsPerUnit: 110 },
  { keywords: ['cookie'], unit: 'piece', gramsPerUnit: 40 },
  { keywords: ['muffin'], unit: 'piece', gramsPerUnit: 90 },
  { keywords: ['biscuit'], unit: 'piece', gramsPerUnit: 60 },
  { keywords: ['arancini'], unit: 'piece', gramsPerUnit: 50 },
  { keywords: ['waffle'], unit: 'piece', gramsPerUnit: 75 },
  { keywords: ['omelet'], unit: 'piece', gramsPerUnit: 180 },
  { keywords: ['plantain'], unit: 'piece', gramsPerUnit: 25 },
  { keywords: ['pastr'], unit: 'piece', gramsPerUnit: 55 }, // pastry/pastries
  { keywords: ['dessert bar'], unit: 'piece', gramsPerUnit: 50 },
  { keywords: ['cinnamon twist'], unit: 'piece', gramsPerUnit: 50 },
  {
    keywords: [
      'beef', 'steak', 'burger', 'meatball', 'meatloaf', 'pork', 'bacon', 'ham', 'sausage',
      'chicken', 'turkey', 'poultry', 'salmon', 'fish', 'tuna', 'shrimp', 'seafood', 'cod',
      'tofu', 'tempeh', 'seitan', 'egg', 'lamb', 'haddock', 'pollock', 'carne asada', "chick'n",
    ],
    unit: 'palm',
    gramsPerUnit: 85,
  },
  {
    keywords: [
      'sauce', 'gravy', 'dressing', 'aioli', 'vinaigrette', 'crema', 'chutney', 'salsa', 'hummus',
      'sour cream', 'onion', 'olive', 'pickle', 'avocado', 'basil', 'brown sugar', 'cranberries',
      'pico de gallo',
    ],
    unit: 'tbsp',
    gramsPerUnit: 15,
  },
  { keywords: ['cheese'], unit: 'slice', gramsPerUnit: 20 },
];

// "corn" is the one keyword in this table that substring-collides with
// common words that aren't corn at all ("Cornell", "Corned Beef") — a plain
// word-boundary check would break plural matching everywhere else (e.g.
// "carrot" needs to match "Carrots"), so this stays a narrow special case
// rather than a general word-boundary rule.
const CORN_RE = /\bcorn(?![a-z])/;

function matchesKeyword(keyword: string, lower: string): boolean {
  if (keyword === 'corn') return CORN_RE.test(lower);
  return lower.includes(keyword);
}

// Unmatched/composite items (casseroles, stir-fries, whole entrées with no
// single-shape keyword) default to a fraction of a plate rather than a
// countable unit.
const DEFAULT_RULE: { unit: PortionUnit; gramsPerUnit: number } = { unit: 'plate', gramsPerUnit: 300 };

const UNIT_LABELS: Record<PortionUnit, { label: string; pluralLabel: string }> = {
  scoop: { label: 'scoop', pluralLabel: 'scoops' },
  slice: { label: 'slice', pluralLabel: 'slices' },
  cup: { label: 'cup', pluralLabel: 'cups' },
  palm: { label: 'palm', pluralLabel: 'palms' },
  plate: { label: 'plate', pluralLabel: 'plates' },
  tbsp: { label: 'tbsp', pluralLabel: 'tbsp' },
  piece: { label: 'piece', pluralLabel: 'pieces' },
};

// cup/plate are volumetric and read naturally in quarters ("¾ cup"); the
// countable units read more naturally in halves ("1½ scoops").
const QUARTER_UNITS = new Set<PortionUnit>(['cup', 'plate']);

/** The everyday unit + grams-per-unit this food is pictured in. */
export function getPortionUnit(item: { name: string }): PortionUnitInfo {
  const lower = item.name.toLowerCase();
  const rule = UNIT_RULES.find((r) => r.keywords.some((k) => matchesKeyword(k, lower))) ?? DEFAULT_RULE;
  return { unit: rule.unit, gramsPerUnit: rule.gramsPerUnit, ...UNIT_LABELS[rule.unit] };
}

function formatFraction(n: number, granularity: 0.25 | 0.5): string {
  const rounded = Math.round(n / granularity) * granularity;
  const whole = Math.floor(rounded);
  const frac = +(rounded - whole).toFixed(2);
  const glyph = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
  if (whole === 0) return glyph || '0';
  return glyph ? `${whole}${glyph}` : `${whole}`;
}

/**
 * A plain-language portion estimate ("≈ 1½ scoops", "≈ ¾ cup") derived from
 * getPortionUnit — the point isn't the exact figure, it's translating an
 * abstract gram count into something you can actually picture and step
 * through, since grams alone don't tell you how big a portion looks.
 */
export function describePortion(item: { name: string; grams: number }): string {
  if (item.grams <= 0) return '';
  const info = getPortionUnit(item);
  const granularity = QUARTER_UNITS.has(info.unit) ? 0.25 : 0.5;
  const rawCount = item.grams / info.gramsPerUnit;
  const rounded = Math.round(rawCount / granularity) * granularity;
  // A nonzero gram amount that rounds down to 0 units still gets the
  // smallest displayable step, rather than silently reading "0".
  const count = rounded > 0 ? rounded : granularity;
  const unitLabel = count > 1 ? info.pluralLabel : info.label;
  return `≈ ${formatFraction(count, granularity)} ${unitLabel}`;
}

/**
 * Steps `grams` by one portion-unit increment (a quarter unit for cup/plate,
 * a half unit otherwise) in `direction`. Snaps to the currently-displayed
 * rounded count first, so the button always moves relative to what
 * describePortion just showed rather than an unrounded fraction, then
 * rounds the result to the nearest 5g. Never goes below 0.
 */
export function stepPortionGrams(item: { name: string }, grams: number, direction: 1 | -1): number {
  const info = getPortionUnit(item);
  const granularity = QUARTER_UNITS.has(info.unit) ? 0.25 : 0.5;
  const currentCount = Math.round(grams / info.gramsPerUnit / granularity) * granularity;
  const nextCount = Math.max(0, currentCount + direction * granularity);
  return Math.round((nextCount * info.gramsPerUnit) / 5) * 5;
}
