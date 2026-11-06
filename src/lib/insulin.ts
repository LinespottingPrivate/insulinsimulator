import { DRINK_BY_ID, type Drink, type Profile } from "@/data/drinks";

export type SimOptions = {
  ml: number;
  /** Fasted morning (default) vs alongside breakfast. */
  fasted: boolean;
  /** 1 = typical healthy adult. Higher = more insulin for the same glass. */
  sensitivity: number;
};

export type SugarSplit = {
  maltose: number;
  glucose: number;
  sucrose: number;
  fructose: number;
  lactose: number;
  galactose: number;
  starch: number;
};

export type SimResult = {
  points: { t: number; insulin: number; glucose: number }[];
  peakInsulin: number;
  peakGlucose: number;
  timeToPeak: number;
  aucInsulin: number;
  gl: number;
  gi: number;
  carbs: number;
  sugars: number;
  fat: number;
  protein: number;
  fiber: number;
  kcal: number;
  split: SugarSplit;
  /** 100 = same AUC as Coca-Cola at the same volume, state and sensitivity. */
  load: number;
  carbShare: number;
};

const MATRIX: Record<Profile, number> = {
  maltos: 1,
  starkelse: 0.82,
  laktos: 1,
  laktosfri: 1,
  fil: 0.38,
  "juice-citrus": 0.82,
  "juice-apple": 0.86,
  "juice-grape": 0.94,
  "juice-trop": 0.9,
  sackaros: 1.05,
  "choklad-mjolk": 0.96,
  agave: 0.9,
  ris: 1.08,
  "havre-juice": 0.9,
  lite: 1,
};

const PROTEIN_FACTOR = {
  dairy: 1,
  soy: 0.34,
  pea: 0.4,
  oat: 0.14,
  almond: 0.1,
  none: 0.04,
} as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function starchGi(profile: Profile): number {
  if (profile === "starkelse") return 54;
  if (profile === "ris") return 90;
  if (profile === "maltos" || profile === "havre-juice") return 78;
  return 68;
}

export function sugarSplit(drink: Drink, ml: number): SugarSplit {
  const scale = ml / 100;
  const carb = drink.carb * scale;
  const sugar = drink.sugar * scale;
  const added = Math.min(sugar, drink.addedSugarPer100 * scale);
  const rest = Math.max(0, sugar - added);
  const split: SugarSplit = {
    maltose: 0,
    glucose: 0,
    sucrose: added,
    fructose: 0,
    lactose: 0,
    galactose: 0,
    starch: Math.max(0, carb - sugar),
  };

  switch (drink.profile) {
    case "maltos":
    case "havre-juice": {
      const maltShare = drink.profile === "havre-juice" ? 0.28 : 0.82;
      const gluShare = drink.profile === "havre-juice" ? 0.22 : 0.12;
      const fruShare = drink.profile === "havre-juice" ? 0.3 : 0;
      const sucShare = drink.profile === "havre-juice" ? 0.2 : 0.06;
      split.maltose += rest * maltShare;
      split.glucose += rest * gluShare;
      split.fructose += rest * fruShare;
      split.sucrose += rest * sucShare;
      break;
    }
    case "starkelse":
    case "lite":
      split.glucose += rest;
      break;
    case "laktos":
      split.lactose += rest;
      break;
    case "laktosfri":
      split.glucose += rest * 0.5;
      split.galactose += rest * 0.5;
      break;
    case "fil":
      split.lactose += rest * 0.88;
      split.galactose += rest * 0.12;
      break;
    case "juice-citrus":
      split.sucrose += rest * 0.45;
      split.glucose += rest * 0.27;
      split.fructose += rest * 0.28;
      break;
    case "juice-apple":
      split.fructose += rest * 0.55;
      split.glucose += rest * 0.22;
      split.sucrose += rest * 0.23;
      break;
    case "juice-grape":
      split.glucose += rest * 0.48;
      split.fructose += rest * 0.48;
      split.sucrose += rest * 0.04;
      break;
    case "juice-trop":
      split.sucrose += rest * 0.4;
      split.glucose += rest * 0.32;
      split.fructose += rest * 0.28;
      break;
    case "sackaros":
      split.sucrose += rest * 0.92;
      split.glucose += rest * 0.04;
      split.fructose += rest * 0.04;
      break;
    case "choklad-mjolk": {
      const lactose = Math.min(rest, 4.8 * scale);
      split.lactose += lactose;
      split.sucrose += Math.max(0, rest - lactose);
      break;
    }
    case "agave":
      split.fructose += rest * 0.72;
      split.glucose += rest * 0.28;
      break;
    case "ris":
      split.sucrose += rest * 0.7;
      split.glucose += rest * 0.3;
      break;
    default:
      split.glucose += rest;
  }

  return split;
}

function gamma(t: number, tp: number, n: number): number {
  if (t <= 0 || tp <= 0) return 0;
  const x = t / tp;
  return Math.pow(x, n) * Math.exp(n * (1 - x));
}

const cokeAucCache = new Map<string, number>();

export function simulate(drink: Drink, options: SimOptions, cokeAuc?: number): SimResult {
  const { ml, fasted, sensitivity } = options;
  const scale = ml / 100;
  const carbs = drink.carb * scale;
  const sugars = drink.sugar * scale;
  const fat = drink.fat * scale;
  const protein = drink.protein * scale;
  const fiber = drink.fiber * scale;
  const kcal = drink.kcal * scale;
  const split = sugarSplit(drink, ml);

  const giRaw =
    split.maltose * 105 +
    split.glucose * 100 +
    split.sucrose * 65 +
    split.lactose * 46 +
    split.fructose * 19 +
    split.galactose * 23 +
    split.starch * starchGi(drink.profile);
  const gi = carbs > 0.15 ? (giRaw / carbs) * MATRIX[drink.profile] : 0;

  const dairy = drink.proteinKind === "dairy";
  const fatWeight = dairy ? 0.28 : 1;
  const fatAtten = clamp(1 - 0.021 * Math.max(0, fat - 0.6) * fatWeight, 0.66, 1);
  const fiberAtten = clamp(1 - 0.045 * fiber, 0.78, 1);
  const gl = (gi * fatAtten * fiberAtten * carbs) / 100;

  const state = fasted ? 1.16 : 0.74;
  const sens = clamp(sensitivity, 0.5, 1.8);

  let tCarb = fasted ? 26 : 48;
  if (drink.category === "juice" || drink.category === "nektar" || drink.category === "lask") {
    tCarb -= 6;
  }
  if (drink.profile === "sackaros") tCarb -= 3;
  tCarb += fat * (dairy ? 0.35 : 1.25);
  tCarb += fiber * 1.6;
  tCarb = clamp(tCarb, 16, 90);

  const nCarb =
    drink.category === "juice" || drink.category === "lask" || drink.category === "nektar"
      ? 3.3
      : 2.55;
  const nProt = dairy ? 2.15 : 2.4;

  const carbAuc = 108 * gl * state * sens;
  const protAuc = protein * PROTEIN_FACTOR[drink.proteinKind] * 128 * state * sens;
  const carbCurve = scaleShape(tCarb, nCarb, carbAuc);
  const protCurve = scaleShape(tCarb + (dairy ? 16 : 10), nProt, protAuc);

  const peakGlucose = 2.75 * gl * (fasted ? 1.05 : 0.78) * (1 + 0.12 * (sens - 1));
  const glucoseCurve = scaleShape(tCarb, nCarb, 1);
  const gPeakShape = Math.max(...glucoseCurve.map((p) => p.w), 0);
  const gScale = gPeakShape > 0 ? peakGlucose / gPeakShape : 0;

  const points: SimResult["points"] = [];
  let peakInsulin = 0;
  let timeToPeak = 0;
  let seenGlucose = 0;
  let auc = 0;
  let prevI = 0;

  for (let i = 0; i < carbCurve.length; i++) {
    const t = carbCurve[i]!.t;
    const insulin = (carbCurve[i]?.w ?? 0) + (protCurve[i]?.w ?? 0);
    const glucose = (glucoseCurve[i]?.w ?? 0) * gScale;
    points.push({
      t,
      insulin: Math.round(insulin * 10) / 10,
      glucose: Math.round(glucose * 10) / 10,
    });
    if (insulin > peakInsulin) {
      peakInsulin = insulin;
      timeToPeak = t;
    }
    if (glucose > seenGlucose) seenGlucose = glucose;
    if (t > 0) auc += ((prevI + insulin) / 2) * 5;
    prevI = insulin;
  }

  const drive = carbAuc + protAuc;
  const load = cokeAuc && cokeAuc > 0 ? Math.round((auc / cokeAuc) * 1000) / 10 : 0;

  return {
    points,
    peakInsulin: Math.round(peakInsulin),
    peakGlucose: Math.round(seenGlucose),
    timeToPeak,
    aucInsulin: Math.round(auc),
    gl: Math.round(gl * 10) / 10,
    gi: Math.round(gi),
    carbs: Math.round(carbs * 10) / 10,
    sugars: Math.round(sugars * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    protein: Math.round(protein * 10) / 10,
    fiber: Math.round(fiber * 10) / 10,
    kcal: Math.round(kcal),
    split: {
      maltose: round1(split.maltose),
      glucose: round1(split.glucose),
      sucrose: round1(split.sucrose),
      fructose: round1(split.fructose),
      lactose: round1(split.lactose),
      galactose: round1(split.galactose),
      starch: round1(split.starch),
    },
    load,
    carbShare: drive > 0 ? Math.round((carbAuc / drive) * 100) : 0,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function scaleShape(tPeak: number, n: number, targetAuc: number): { t: number; w: number }[] {
  const pts: { t: number; w: number }[] = [];
  for (let t = 0; t <= 180; t += 5) pts.push({ t, w: gamma(t, tPeak, n) });
  let area = 0;
  let prev = 0;
  for (const p of pts) {
    if (p.t > 0) area += ((prev + p.w) / 2) * 5;
    prev = p.w;
  }
  const k = area > 0 ? targetAuc / area : 0;
  return pts.map((p) => ({ t: p.t, w: p.w * k }));
}

export function simulateWithRef(drink: Drink, options: SimOptions): SimResult {
  const auc = referenceCokeAuc(options);
  return simulate(drink, options, auc);
}

export function referenceCokeAuc(options: SimOptions): number {
  const key = `${options.ml}|${options.fasted ? 1 : 0}|${options.sensitivity}`;
  const cached = cokeAucCache.get(key);
  if (cached != null) return cached;
  const coke = DRINK_BY_ID["cola"];
  if (!coke) return 1;
  const bare = simulate(coke, options, 1);
  // simulate(..., 1) sets load against auc 1, but aucInsulin is the real AUC.
  cokeAucCache.set(key, bare.aucInsulin || 1);
  return bare.aucInsulin || 1;
}
