"use client";

import dynamic from "next/dynamic";

const Grainient = dynamic(() => import("@/components/Grainient"), {
  ssr: false,
});

export function GrainientBackground() {
  return (
    <Grainient
      color1="#383838"
      color2="#000000"
      color3="#787878"
      timeSpeed={0.25}
      colorBalance={0}
      warpStrength={1}
      warpFrequency={5}
      warpSpeed={2}
      warpAmplitude={50}
      blendAngle={0}
      blendSoftness={0.05}
      rotationAmount={500}
      noiseScale={2}
      grainAmount={0.1}
      grainScale={2}
      grainAnimated={false}
      contrast={1.5}
      gamma={1}
      saturation={1}
      centerX={0}
      centerY={0}
      zoom={0.9}
    />
  );
}
