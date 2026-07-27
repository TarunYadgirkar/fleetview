export interface RoiInputs {
  robots: number;
  hardwareCostPerRobot: number;
  /** fully-loaded annual cost of one displaced worker. */
  annualLaborCostPerWorker: number;
  /** full-time-equivalent workers the fleet displaces. */
  workersDisplaced: number;
  /** annual maintenance + energy per robot. */
  annualOpsCostPerRobot: number;
  horizonYears?: number;
}

export interface RoiResult {
  capex: number;
  annualLaborSaved: number;
  annualOpsCost: number;
  annualNetSaving: number;
  /** capex / monthly net saving; Infinity when net saving ≤ 0. */
  paybackMonths: number;
  roiPct: number;
}

export function computeRoi(inputs: RoiInputs): RoiResult {
  const horizonYears = inputs.horizonYears ?? 5;
  const capex = inputs.robots * inputs.hardwareCostPerRobot;
  const annualLaborSaved = inputs.workersDisplaced * inputs.annualLaborCostPerWorker;
  const annualOpsCost = inputs.robots * inputs.annualOpsCostPerRobot;
  const annualNetSaving = annualLaborSaved - annualOpsCost;

  const paybackMonths = annualNetSaving > 0 ? capex / (annualNetSaving / 12) : Infinity;
  const roiPct = capex > 0 ? ((annualNetSaving * horizonYears - capex) / capex) * 100 : 0;

  return {
    capex,
    annualLaborSaved,
    annualOpsCost,
    annualNetSaving,
    paybackMonths,
    roiPct,
  };
}
