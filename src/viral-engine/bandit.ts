import { FORMULAS, TEMPLATES, type HookFormula, type TemplateId } from "./types";

export type BanditState = Record<string, { alpha: number; beta: number }>;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const armKey = (template: TemplateId, formula: HookFormula): string => `${template}:${formula}`;

export const allArms = (): string[] => TEMPLATES.flatMap((t) => FORMULAS.map((f) => armKey(t, f)));

export function parseArm(arm: string): { template: TemplateId; formula: HookFormula } {
  const [template, formula] = arm.split(":") as [TemplateId, HookFormula];
  return { template, formula };
}

function normal(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Marsaglia–Tsang, valable pour shape ≥ 1 (le prior Beta(1,1) le garantit).
function gamma(shape: number, rng: () => number): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(alpha: number, beta: number, rng: () => number): number {
  const x = gamma(alpha, rng);
  return x / (x + gamma(beta, rng));
}

// Thompson sampling : chaque bras tire une probabilité de succès plausible, le plus haut gagne.
export function chooseArm(state: BanditState, arms: string[], rng: () => number = Math.random): string {
  let best = arms[0];
  let bestDraw = -1;
  for (const arm of arms) {
    const { alpha, beta } = state[arm] ?? { alpha: 1, beta: 1 };
    const draw = sampleBeta(alpha, beta, rng);
    if (draw > bestDraw) {
      bestDraw = draw;
      best = arm;
    }
  }
  return best;
}

export function updateArm(state: BanditState, arm: string, reward: 0 | 1): BanditState {
  const prev = state[arm] ?? { alpha: 1, beta: 1 };
  return { ...state, [arm]: { alpha: prev.alpha + reward, beta: prev.beta + (1 - reward) } };
}

export function rewardFromViews(views: number, history: number[]): 0 | 1 {
  if (!history.length) return views > 0 ? 1 : 0;
  const sorted = [...history].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return views >= median ? 1 : 0;
}
