import { useRef, useEffect, useCallback, useState } from 'react';
import { juceBridge } from '../../api/juce-bridge';
import type { WaveformData } from '../../api/types';

interface WaveformDisplayProps {
  height?: number;
}

export function WaveformDisplay({ height = 100 }: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const preDataRef = useRef<number[]>([]);
  const postDataRef = useRef<number[]>([]);

  const [showInput, setShowInput] = useState(true);
  const [showOutput, setShowOutput] = useState(true);

  // Zoom state
  const [zoomX, setZoomX] = useState(1);
  const [zoomY, setZoomY] = useState(1);
  const [panX, setPanX] = useState(0.5);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }

    const width = rect.width;
    const canvasHeight = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, canvasHeight);

    // Draw subtle grid lines for pro look
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    // Horizontal grid at 25%, 50%, 75%
    for (const frac of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(0, canvasHeight * frac);
      ctx.lineTo(width, canvasHeight * frac);
      ctx.stroke();
    }

    // Center line (slightly brighter)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(0, canvasHeight / 2);
    ctx.lineTo(width, canvasHeight / 2);
    ctx.stroke();

    const bothVisible = showInput && showOutput;
    const baseOpacity = bothVisible ? 0.55 : 0.85;

    // Draw input waveform (white/silver) - draw first so output overlays
    if (showInput && preDataRef.current.length > 0) {
      drawWaveform(ctx, preDataRef.current, width, canvasHeight, `rgba(200, 200, 210, ${baseOpacity})`);
    }

    // Draw output waveform (accent orange)
    if (showOutput && postDataRef.current.length > 0) {
      drawWaveform(ctx, postDataRef.current, width, canvasHeight, `rgba(255, 107, 0, ${baseOpacity})`);
    }

    // Draw zoom indicator if zoomed
    if (zoomX > 1 || zoomY > 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '9px monospace';
      ctx.fillText(`${zoomX.toFixed(1)}x / ${zoomY.toFixed(1)}x`, 4, 10);
    }
  }, [showInput, showOutput, zoomX, zoomY, panX]);

  const drawWaveform = useCallback((
    ctx: CanvasRenderingContext2D,
    data: number[],
    width: number,
    height: number,
    color: string
  ) => {
    const dataLength = data.length;
    if (dataLength === 0) return;

    // Calculate visible range based on zoom and pan
    const visibleRatio = 1 / zoomX;
    const startRatio = Math.max(0, panX - visibleRatio / 2);
    const endRatio = Math.min(1, panX + visibleRatio / 2);

    const startIdx = Math.floor(startRatio * dataLength);
    const endIdx = Math.ceil(endRatio * dataLength);
    const visibleCount = endIdx - startIdx;

    if (visibleCount <= 0) return;

    const barWidth = width / visibleCount;
    const centerY = height / 2;
    const maxHeight = height * 0.9 * zoomY;

    ctx.fillStyle = color;

    for (let i = 0; i < visibleCount; i++) {
      const dataIdx = startIdx + i;
      if (dataIdx >= dataLength) break;

      const value = Math.min(data[dataIdx], 1);
      const barHeight = value * maxHeight / 2;
      const x = i * barWidth;

      if (barHeight > 0.5) {
        const clippedTop = Math.max(0, centerY - barHeight);
        const clippedBottom = Math.min(height, centerY + barHeight);
        const clippedHeight = clippedBottom - clippedTop;

        if (clippedHeight > 0) {
          ctx.fillRect(x, clippedTop, Math.max(barWidth - 1, 1), clippedHeight);
        }
      }
    }
  }, [zoomX, zoomY, panX]);

  // Handle wheel events for zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();

    const isPinch = e.ctrlKey || Math.abs(e.deltaY) < 50;

    if (isPinch) {
      const zoomDelta = -e.deltaY * 0.01;
      setZoomY(prev => Math.max(0.5, Math.min(10, prev + zoomDelta * prev)));
    } else if (e.shiftKey) {
      const panDelta = e.deltaY * 0.001;
      setPanX(prev => {
        const visibleRatio = 1 / zoomX;
        const minPan = visibleRatio / 2;
        const maxPan = 1 - visibleRatio / 2;
        return Math.max(minPan, Math.min(maxPan, prev + panDelta));
      });
    } else {
      const zoomDelta = -e.deltaY * 0.005;
      setZoomX(prev => {
        const newZoom = Math.max(1, Math.min(20, prev + zoomDelta * prev));
        if (newZoom < prev) {
          const visibleRatio = 1 / newZoom;
          const minPan = visibleRatio / 2;
          const maxPan = 1 - visibleRatio / 2;
          setPanX(p => Math.max(minPan, Math.min(maxPan, p)));
        }
        return newZoom;
      });
    }
  }, [zoomX]);

  const handleDoubleClick = useCallback(() => {
    setZoomX(1);
    setZoomY(1);
    setPanX(0.5);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  useEffect(() => {
    const unsubscribe = juceBridge.onWaveformData((data: WaveformData) => {
      preDataRef.current = data.pre;
      postDataRef.current = data.post;
    });

    const animate = () => {
      draw();
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      unsubscribe();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Toggle buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowInput(!showInput)}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xxs font-medium transition-all ${
            showInput
              ? 'bg-white/8 text-plugin-text border border-white/20'
              : 'text-plugin-dim border border-plugin-border hover:border-plugin-muted'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${showInput ? 'bg-white' : 'bg-plugin-dim'}`} />
          Input
        </button>
        <button
          onClick={() => setShowOutput(!showOutput)}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xxs font-medium transition-all ${
            showOutput
              ? 'bg-plugin-accent/12 text-plugin-accent border border-plugin-accent/30'
              : 'text-plugin-dim border border-plugin-border hover:border-plugin-muted'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${showOutput ? 'bg-plugin-accent' : 'bg-plugin-dim'}`} />
          Output
        </button>

        {/* Zoom reset */}
        {(zoomX > 1 || zoomY > 1) && (
          <button
            onClick={handleDoubleClick}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xxs text-plugin-dim hover:text-plugin-text border border-plugin-border hover:border-plugin-muted transition-all ml-auto font-mono"
          >
            Reset
          </button>
        )}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full rounded border border-plugin-border cursor-crosshair"
        style={{ height: `${height}px`, background: '#050505' }}
        onDoubleClick={handleDoubleClick}
        title="Scroll: zoom | Pinch: amplitude | Shift+scroll: pan | Double-click: reset"
      />
    </div>
  );
}
