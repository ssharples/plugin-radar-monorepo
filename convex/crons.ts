import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "recompute plugin pairings",
  { hourUTC: 4, minuteUTC: 0 },
  internal.pluginPairings.recomputePairings,
);

export default crons;
