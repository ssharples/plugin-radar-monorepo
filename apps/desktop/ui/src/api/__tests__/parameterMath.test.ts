import { describe, it, expect } from 'vitest';

// ============================================
// Port of JUCE NormalisableRange skew formulas
// (same as convex/parameterTranslation.ts)
// ============================================
function denormalizeWithSkew(
  normalized: number,
  start: number,
  end: number,
  skew: number,
  symmetricSkew: boolean
): number {
  const clamped = Math.max(0, Math.min(1, normalized));

  if (skew === 1.0) {
    return start + (end - start) * clamped;
  }

  if (symmetricSkew) {
    const mid = (start + end) * 0.5;
    if (clamped < 0.5) {
      const proportion = clamped * 2.0;
      return start + (mid - start) * Math.pow(proportion, 1.0 / skew);
    } else {
      const proportion = (clamped - 0.5) * 2.0;
      return mid + (end - mid) * Math.pow(proportion, 1.0 / skew);
    }
  }

  return start + (end - start) * Math.pow(clamped, 1.0 / skew);
}

function normalizeWithSkew(
  physical: number,
  start: number,
  end: number,
  skew: number,
  symmetricSkew: boolean
): number {
  const range = end - start;
  if (range <= 0) return 0;

  const clampedPhysical = Math.max(start, Math.min(end, physical));

  if (skew === 1.0) {
    return (clampedPhysical - start) / range;
  }

  if (symmetricSkew) {
    const mid = (start + end) * 0.5;
    if (clampedPhysical < mid) {
      const proportion = (clampedPhysical - start) / (mid - start);
      return Math.pow(Math.max(0, proportion), skew) * 0.5;
    } else {
      const proportion = (clampedPhysical - mid) / (end - mid);
      return 0.5 + Math.pow(Math.max(0, proportion), skew) * 0.5;
    }
  }

  const proportion = (clampedPhysical - start) / range;
  return Math.pow(Math.max(0, proportion), skew);
}

function convertUnits(value: number, sourceUnit: string, targetUnit: string): number {
  if (sourceUnit === targetUnit) return value;

  if (sourceUnit === 'q_factor' && targetUnit === 'bandwidth_octaves') {
    if (value <= 0) return 1.0;
    return (2 * Math.asinh(1 / (2 * value))) / Math.LN2;
  }
  if (sourceUnit === 'bandwidth_octaves' && targetUnit === 'q_factor') {
    if (value <= 0) return 1.0;
    return 1 / (2 * Math.sinh((value * Math.LN2) / 2));
  }

  if (sourceUnit === 'ms' && targetUnit === 's') return value / 1000;
  if (sourceUnit === 's' && targetUnit === 'ms') return value * 1000;

  return value;
}

// ============================================
// Tests
// ============================================

describe('denormalizeWithSkew', () => {
  it('frequency parameter: 0.5 normalized → ~632Hz (geometric mean)', () => {
    // JUCE formula with skew=0.199: physical = 20 + (20000-20) * 0.5^(1/0.199)
    const result = denormalizeWithSkew(0.5, 20, 20000, 0.199, false);
    // Geometric mean of 20 and 20000 ≈ 632
    expect(result).toBeGreaterThan(500);
    expect(result).toBeLessThan(800);
  });

  it('linear case (skew=1): matches simple interpolation', () => {
    expect(denormalizeWithSkew(0.0, -60, 0, 1.0, false)).toBeCloseTo(-60, 5);
    expect(denormalizeWithSkew(0.5, -60, 0, 1.0, false)).toBeCloseTo(-30, 5);
    expect(denormalizeWithSkew(1.0, -60, 0, 1.0, false)).toBeCloseTo(0, 5);
  });

  it('boundary values: 0 → start, 1 → end', () => {
    expect(denormalizeWithSkew(0.0, 20, 20000, 0.199, false)).toBeCloseTo(20, 1);
    expect(denormalizeWithSkew(1.0, 20, 20000, 0.199, false)).toBeCloseTo(20000, 1);
  });

  it('clamping: values outside 0-1 are clamped', () => {
    expect(denormalizeWithSkew(-0.5, 20, 20000, 0.199, false)).toBeCloseTo(20, 1);
    expect(denormalizeWithSkew(1.5, 20, 20000, 0.199, false)).toBeCloseTo(20000, 1);
  });
});

describe('normalizeWithSkew', () => {
  it('round-trip: normalize(denormalize(x)) ≈ x', () => {
    const testValues = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    for (const x of testValues) {
      const physical = denormalizeWithSkew(x, 20, 20000, 0.199, false);
      const roundTrip = normalizeWithSkew(physical, 20, 20000, 0.199, false);
      expect(roundTrip).toBeCloseTo(x, 4);
    }
  });

  it('round-trip with linear (skew=1)', () => {
    const testValues = [0.0, 0.25, 0.5, 0.75, 1.0];
    for (const x of testValues) {
      const physical = denormalizeWithSkew(x, -60, 0, 1.0, false);
      const roundTrip = normalizeWithSkew(physical, -60, 0, 1.0, false);
      expect(roundTrip).toBeCloseTo(x, 5);
    }
  });

  it('boundary: start → 0, end → 1', () => {
    expect(normalizeWithSkew(20, 20, 20000, 0.199, false)).toBeCloseTo(0, 5);
    expect(normalizeWithSkew(20000, 20, 20000, 0.199, false)).toBeCloseTo(1, 5);
  });
});

describe('symmetric skew', () => {
  it('round-trip with symmetric skew', () => {
    const testValues = [0.0, 0.25, 0.49, 0.51, 0.75, 1.0];
    for (const x of testValues) {
      const physical = denormalizeWithSkew(x, -24, 24, 0.5, true);
      const roundTrip = normalizeWithSkew(physical, -24, 24, 0.5, true);
      expect(roundTrip).toBeCloseTo(x, 4);
    }
  });

  it('midpoint at 0.5 → center of range', () => {
    const mid = denormalizeWithSkew(0.5, -24, 24, 0.5, true);
    expect(mid).toBeCloseTo(0, 1); // Center of -24 to 24
  });
});

describe('convertUnits', () => {
  it('Q=1.414 → ~1.0 octave', () => {
    const octaves = convertUnits(1.414, 'q_factor', 'bandwidth_octaves');
    expect(octaves).toBeCloseTo(1.0, 1);
  });

  it('1.0 octave → Q≈1.414', () => {
    const q = convertUnits(1.0, 'bandwidth_octaves', 'q_factor');
    expect(q).toBeCloseTo(1.414, 1);
  });

  it('Q↔octaves round-trip', () => {
    const q = 2.5;
    const octaves = convertUnits(q, 'q_factor', 'bandwidth_octaves');
    const roundTrip = convertUnits(octaves, 'bandwidth_octaves', 'q_factor');
    expect(roundTrip).toBeCloseTo(q, 4);
  });

  it('ms → s and back', () => {
    expect(convertUnits(500, 'ms', 's')).toBeCloseTo(0.5, 5);
    expect(convertUnits(0.5, 's', 'ms')).toBeCloseTo(500, 5);
  });

  it('same unit returns value unchanged', () => {
    expect(convertUnits(42, 'hz', 'hz')).toBe(42);
  });
});
