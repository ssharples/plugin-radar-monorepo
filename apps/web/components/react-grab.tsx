"use client";

// React Grab - for selecting elements and copying context to AI agents
// Only loaded in development
if (process.env.NODE_ENV === "development") {
  import("react-grab");
}

export function ReactGrab() {
  return null;
}
