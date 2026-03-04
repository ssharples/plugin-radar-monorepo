"use client";

import { useRef, useEffect, useState } from "react";

interface LiquidMetalCardProps {
  children: React.ReactNode;
  className?: string;
  borderWidth?: number;
}

export function LiquidMetalCard({
  children,
  className = "",
  borderWidth = 2,
}: LiquidMetalCardProps) {
  const shaderRef = useRef<HTMLDivElement>(null);
  const shaderMount = useRef<any>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const styleId = "liquid-metal-card-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .liquid-metal-card-shader canvas {
          width: 100% !important;
          height: 100% !important;
          display: block !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          border-radius: 16px !important;
        }
      `;
      document.head.appendChild(style);
    }

    const loadShader = async () => {
      try {
        const { liquidMetalFragmentShader, ShaderMount } = await import(
          "@paper-design/shaders"
        );

        if (shaderRef.current) {
          if (shaderMount.current?.destroy) {
            shaderMount.current.destroy();
          }

          shaderMount.current = new ShaderMount(
            shaderRef.current,
            liquidMetalFragmentShader,
            {
              u_repetition: 4,
              u_softness: 0.5,
              u_shiftRed: 0.3,
              u_shiftBlue: 0.3,
              u_distortion: 0,
              u_contour: 0,
              u_angle: 45,
              u_scale: 8,
              u_shape: 1,
              u_offsetX: 0.1,
              u_offsetY: -0.1,
            },
            undefined,
            0.4,
          );
        }
      } catch (error) {
        console.error("Failed to load shader:", error);
      }
    };

    loadShader();

    return () => {
      if (shaderMount.current?.destroy) {
        shaderMount.current.destroy();
        shaderMount.current = null;
      }
    };
  }, []);

  const handleMouseEnter = () => {
    setIsHovered(true);
    shaderMount.current?.setSpeed?.(1.2);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    shaderMount.current?.setSpeed?.(0.4);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Shader border layer */}
      <div
        className="absolute inset-0 rounded-2xl overflow-hidden"
        style={{
          boxShadow: isHovered
            ? "0px 0px 40px 0px rgba(222, 255, 10, 0.08), 0px 8px 24px 0px rgba(0, 0, 0, 0.3)"
            : "0px 0px 20px 0px rgba(222, 255, 10, 0.04), 0px 4px 12px 0px rgba(0, 0, 0, 0.2)",
          transition: "box-shadow 0.6s ease",
        }}
      >
        <div
          ref={shaderRef}
          className="liquid-metal-card-shader"
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            borderRadius: "16px",
            overflow: "hidden",
          }}
        />
      </div>

      {/* Inner content */}
      <div
        className={`relative rounded-[14px] ${className}`}
        style={{
          margin: `${borderWidth}px`,
          background: "linear-gradient(180deg, rgba(20, 20, 18, 0.97) 0%, rgba(10, 10, 8, 0.99) 100%)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
