import { ConvexHttpClient } from "convex/browser";

export const convexServer = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL!
);
