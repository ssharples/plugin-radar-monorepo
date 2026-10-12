"use client";

import { useEffect, useRef } from "react";

interface GrainientProps {
  color1?: string;
  color2?: string;
  color3?: string;
  timeSpeed?: number;
  colorBalance?: number;
  warpStrength?: number;
  warpFrequency?: number;
  warpSpeed?: number;
  warpAmplitude?: number;
  blendAngle?: number;
  blendSoftness?: number;
  rotationAmount?: number;
  noiseScale?: number;
  grainAmount?: number;
  grainScale?: number;
  grainAnimated?: boolean;
  contrast?: number;
  gamma?: number;
  saturation?: number;
  centerX?: number;
  centerY?: number;
  zoom?: number;
}

export function GrainientBackground({
  color1 = "#ffffff",
  color2 = "#000000",
  color3 = "#787878",
  timeSpeed = 0.25,
  colorBalance = 0,
  warpStrength = 1,
  warpFrequency = 5,
  warpSpeed = 2,
  warpAmplitude = 50,
  blendAngle = 0,
  blendSoftness = 0.05,
  rotationAmount = 500,
  noiseScale = 2,
  grainAmount = 0.1,
  grainScale = 2,
  grainAnimated = false,
  contrast = 1.5,
  gamma = 1,
  saturation = 1,
  centerX = 0,
  centerY = 0,
  zoom = 0.9,
}: GrainientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const setSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setSize();
    window.addEventListener("resize", setSize);

    // Animation state
    let animationFrameId: number;
    let time = 0;

    // Parse colors to RGB
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : { r: 0, g: 0, b: 0 };
    };

    const c1 = hexToRgb(color1);
    const c2 = hexToRgb(color2);
    const c3 = hexToRgb(color3);

    // Noise function (simplified Perlin-like)
    const noise = (x: number, y: number, t: number) => {
      const angle = Math.sin(x * 0.01 * noiseScale + t * timeSpeed * warpSpeed) +
                    Math.cos(y * 0.01 * noiseScale - t * timeSpeed * warpSpeed);
      return (Math.sin(angle * warpFrequency) + 1) / 2;
    };

    // Animation loop
    const animate = () => {
      time += 0.016; // ~60fps

      const w = canvas.width;
      const h = canvas.height;

      // Create gradient with animation
      const gradient = ctx.createRadialGradient(
        w / 2 + centerX + Math.sin(time * timeSpeed) * warpAmplitude,
        h / 2 + centerY + Math.cos(time * timeSpeed * 0.7) * warpAmplitude,
        0,
        w / 2,
        h / 2,
        Math.max(w, h) * zoom
      );

      // Animated color stops
      const t1 = (Math.sin(time * timeSpeed * 0.3) + 1) / 2;
      const t2 = (Math.cos(time * timeSpeed * 0.5) + 1) / 2;
      const t3 = (Math.sin(time * timeSpeed * 0.4 + Math.PI) + 1) / 2;

      // Mix colors with animation
      const mixColor = (c1: any, c2: any, c3: any, t: number) => {
        const balance = colorBalance * 0.5 + 0.5;
        const mix1 = {
          r: Math.round(c1.r * (1 - t) + c2.r * t),
          g: Math.round(c1.g * (1 - t) + c2.g * t),
          b: Math.round(c1.b * (1 - t) + c2.b * t),
        };
        const mix2 = {
          r: Math.round(mix1.r * (1 - balance) + c3.r * balance),
          g: Math.round(mix1.g * (1 - balance) + c3.g * balance),
          b: Math.round(mix1.b * (1 - balance) + c3.b * balance),
        };
        return mix2;
      };

      const color_1 = mixColor(c1, c2, c3, t1);
      const color_2 = mixColor(c2, c3, c1, t2);
      const color_3 = mixColor(c3, c1, c2, t3);

      gradient.addColorStop(0, `rgb(${color_1.r}, ${color_1.g}, ${color_1.b})`);
      gradient.addColorStop(0.5 + blendSoftness, `rgb(${color_2.r}, ${color_2.g}, ${color_2.b})`);
      gradient.addColorStop(1, `rgb(${color_3.r}, ${color_3.g}, ${color_3.b})`);

      // Fill with animated gradient
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // Add grain texture
      if (grainAmount > 0) {
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const grainValue = (Math.random() - 0.5) * grainAmount * 255;
          data[i] += grainValue;     // R
          data[i + 1] += grainValue; // G
          data[i + 2] += grainValue; // B
        }

        ctx.putImageData(imageData, 0, 0);
      }

      // Apply contrast, gamma, saturation (simplified)
      if (contrast !== 1 || gamma !== 1 || saturation !== 1) {
        ctx.filter = `contrast(${contrast}) saturate(${saturation})`;
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = "none";
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", setSize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    color1,
    color2,
    color3,
    timeSpeed,
    colorBalance,
    warpSpeed,
    warpAmplitude,
    noiseScale,
    grainAmount,
    contrast,
    gamma,
    saturation,
    centerX,
    centerY,
    zoom,
    blendSoftness,
    warpFrequency,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  );
}
