import { describe, expect, it } from 'vitest';
import { computeRoi } from '../src/sim/roi';

describe('ROI model', () => {
  it('computes capex, savings, payback, and ROI', () => {
    const r = computeRoi({
      robots: 10,
      hardwareCostPerRobot: 20000,
      annualLaborCostPerWorker: 50000,
      workersDisplaced: 3,
      annualOpsCostPerRobot: 2000,
      horizonYears: 5,
    });
    expect(r.capex).toBe(200000);
    expect(r.annualLaborSaved).toBe(150000);
    expect(r.annualOpsCost).toBe(20000);
    expect(r.annualNetSaving).toBe(130000);
    expect(r.paybackMonths).toBeCloseTo(18.46, 1);
    // (net*5 - capex) / capex * 100
    expect(r.roiPct).toBeCloseTo(225, 0);
  });

  it('payback is Infinity when the fleet never pays for itself', () => {
    const r = computeRoi({
      robots: 5,
      hardwareCostPerRobot: 30000,
      annualLaborCostPerWorker: 40000,
      workersDisplaced: 0,
      annualOpsCostPerRobot: 5000,
    });
    expect(r.annualNetSaving).toBeLessThan(0);
    expect(r.paybackMonths).toBe(Infinity);
  });
});
