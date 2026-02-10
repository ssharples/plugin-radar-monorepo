/**
 * Feature-level plugin similarity scoring.
 *
 * Pure functions — no DB access. Reusable from both plugins.ts and pluginDirectory.ts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal plugin shape needed for scoring. All enrichment fields are optional. */
export interface SimilarityPlugin {
  _id: string;
  name: string;
  category: string;
  subcategory?: string;
  effectType?: string;
  sonicCharacter?: string[];
  keyFeatures?: string[];
  worksWellOn?: string[];
  tonalCharacter?: string[];
  useCases?: string[];
  genreSuitability?: string[];
  comparableTo?: string[];
  isIndustryStandard?: boolean;
  mentionScore?: number;
}

export interface SimilarityResult {
  score: number; // 0–100
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Weight definitions
// ---------------------------------------------------------------------------

interface DimensionWeight {
  field: keyof SimilarityPlugin;
  weight: number;
  method: "exact" | "jaccard" | "comparableTo";
}

const DIMENSIONS: DimensionWeight[] = [
  { field: "effectType", weight: 0.20, method: "exact" },
  { field: "sonicCharacter", weight: 0.15, method: "jaccard" },
  { field: "keyFeatures", weight: 0.15, method: "jaccard" },
  { field: "worksWellOn", weight: 0.12, method: "jaccard" },
  { field: "tonalCharacter", weight: 0.10, method: "jaccard" },
  { field: "useCases", weight: 0.08, method: "jaccard" },
  { field: "genreSuitability", weight: 0.08, method: "jaccard" },
  { field: "comparableTo", weight: 0.07, method: "comparableTo" },
  { field: "subcategory", weight: 0.05, method: "exact" },
];

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/** Jaccard similarity: |A ∩ B| / |A ∪ B|. Returns 0 if either set is empty. */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Shared items between two arrays (case-insensitive). */
function sharedItems(a: string[], b: string[]): string[] {
  const setB = new Set(b.map((s) => s.toLowerCase()));
  return a.filter((item) => setB.has(item.toLowerCase()));
}

/** Check if `name` appears as a substring in any entry of `comparableTo` (case-insensitive). */
export function nameMatchesComparableTo(
  name: string,
  comparableTo: string[]
): boolean {
  const lower = name.toLowerCase();
  return comparableTo.some((entry) => {
    const entryLower = entry.toLowerCase();
    return entryLower.includes(lower) || lower.includes(entryLower);
  });
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Compute a similarity score (0–100) between a source plugin and a candidate.
 * Both must share the same `category` — this function does NOT check that.
 *
 * Uses dynamic weight normalization: if a field is missing on either side,
 * its weight is redistributed proportionally among present fields.
 */
export function computeSimilarityScore(
  source: SimilarityPlugin,
  candidate: SimilarityPlugin
): SimilarityResult {
  const contributions: Array<{
    field: string;
    score: number;
    weight: number;
    shared?: string[];
  }> = [];

  let activeWeightSum = 0;

  // First pass: determine which dimensions are usable
  for (const dim of DIMENSIONS) {
    const srcVal = source[dim.field];
    const candVal = candidate[dim.field];

    const srcPresent = srcVal !== undefined && srcVal !== null &&
      (Array.isArray(srcVal) ? srcVal.length > 0 : true);
    const candPresent = candVal !== undefined && candVal !== null &&
      (Array.isArray(candVal) ? candVal.length > 0 : true);

    if (srcPresent && candPresent) {
      activeWeightSum += dim.weight;
    }
  }

  // If no enrichment overlap at all, return 0
  if (activeWeightSum === 0) {
    return { score: 0, reasons: [] };
  }

  // Second pass: compute scores with normalized weights
  for (const dim of DIMENSIONS) {
    const srcVal = source[dim.field];
    const candVal = candidate[dim.field];

    const srcPresent = srcVal !== undefined && srcVal !== null &&
      (Array.isArray(srcVal) ? srcVal.length > 0 : true);
    const candPresent = candVal !== undefined && candVal !== null &&
      (Array.isArray(candVal) ? candVal.length > 0 : true);

    if (!srcPresent || !candPresent) continue;

    const normalizedWeight = dim.weight / activeWeightSum;
    let dimScore = 0;
    let shared: string[] | undefined;

    switch (dim.method) {
      case "exact":
        dimScore = String(srcVal).toLowerCase() === String(candVal).toLowerCase() ? 1.0 : 0.0;
        break;

      case "jaccard":
        dimScore = jaccardSimilarity(srcVal as string[], candVal as string[]);
        shared = sharedItems(srcVal as string[], candVal as string[]);
        break;

      case "comparableTo": {
        // Check if source's comparableTo mentions candidate's name, or vice versa
        const srcComp = srcVal as string[];
        const candComp = candVal as string[];
        const nameMatch =
          nameMatchesComparableTo(candidate.name, srcComp) ||
          nameMatchesComparableTo(source.name, candComp);
        if (nameMatch) {
          dimScore = 1.0;
        } else {
          // Fall back to Jaccard on the style tokens
          dimScore = jaccardSimilarity(srcComp, candComp);
          shared = sharedItems(srcComp, candComp);
        }
        break;
      }
    }

    contributions.push({
      field: dim.field,
      score: dimScore,
      weight: normalizedWeight,
      shared,
    });
  }

  // Weighted sum
  let totalScore = 0;
  for (const c of contributions) {
    totalScore += c.score * c.weight;
  }

  // Generate reasons from top contributing dimensions
  const reasons = generateReasons(contributions, source, candidate);

  return {
    score: Math.round(totalScore * 100),
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Reason generation
// ---------------------------------------------------------------------------

/** Human-readable labels for fields. */
const FIELD_LABELS: Record<string, string> = {
  effectType: "effect type",
  sonicCharacter: "sonic character",
  keyFeatures: "features",
  worksWellOn: "instrument",
  tonalCharacter: "tonal character",
  useCases: "use case",
  genreSuitability: "genre",
  comparableTo: "comparable style",
  subcategory: "subcategory",
};

function generateReasons(
  contributions: Array<{ field: string; score: number; weight: number; shared?: string[] }>,
  _source: SimilarityPlugin,
  _candidate: SimilarityPlugin
): string[] {
  // Sort by weighted contribution (score * weight), descending
  const sorted = [...contributions]
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score * b.weight - a.score * a.weight);

  const reasons: string[] = [];

  for (const c of sorted.slice(0, 3)) {
    const label = FIELD_LABELS[c.field] || c.field;
    if (c.shared && c.shared.length > 0) {
      const items = c.shared.slice(0, 3).join(", ");
      reasons.push(`Similar ${label}: ${items}`);
    } else if (c.score === 1.0) {
      reasons.push(`Same ${label}`);
    } else if (c.score > 0.5) {
      reasons.push(`Similar ${label}`);
    }
  }

  return reasons;
}

/**
 * Generate a single-line reason string from an array of reasons.
 */
export function generateReasonString(reasons: string[]): string {
  if (reasons.length === 0) return "";
  return reasons.join(" · ");
}

// ---------------------------------------------------------------------------
// Tiebreaker comparator
// ---------------------------------------------------------------------------

/**
 * Compare two candidates by score, then isIndustryStandard, then mentionScore.
 * Returns negative if a should come first.
 */
export function similarityComparator(
  a: { score: number; plugin: SimilarityPlugin },
  b: { score: number; plugin: SimilarityPlugin }
): number {
  if (a.score !== b.score) return b.score - a.score;
  // Prefer industry standard
  const aStd = a.plugin.isIndustryStandard ? 1 : 0;
  const bStd = b.plugin.isIndustryStandard ? 1 : 0;
  if (aStd !== bStd) return bStd - aStd;
  // Then by mention score
  const aMention = a.plugin.mentionScore ?? 0;
  const bMention = b.plugin.mentionScore ?? 0;
  return bMention - aMention;
}
