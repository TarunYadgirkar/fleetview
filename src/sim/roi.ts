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

export function computeRoi(_inputs: RoiInputs): RoiResult {
  throw new Error('not implemented: computeRoi');
}
