import { useRef, useEffect, useCallback, useState } from 'react';
import { juceBridge } from '../../api/juce-bridge';
import type { WaveformData } from '../../api/types';

interface WaveformDisplayProps {
  showInput?: boolean;
  showOutput?: boolean;
}

// Cyber color scheme
const INPUT_COLOR_BASE = '160, 160, 170';   // Cool silver for input
const OUTPUT_COLOR_BASE = '0, 240, 255';     // Cyan accent for output
const GRID_COLOR = 'rgba(222, 255, 10, 0.04)';
const CENTER_LINE_COLOR = 'rgba(222, 255, 10, 0.08)';
const ZOOM_LABEL_COLOR = 'rgba(222, 255, 10, 0.4)';

export function WaveformDisplay({ showInput = true, showOutput = true }: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const preDataRef = useRef<number[]>([]);
  const postDataRef = useRef<number[]>([]);

  // Store all draw parameters in refs so the animation loop never restarts
  const showInputRef = useRef(showInput);
  showInputRef.current = showInput;
  const showOutputRef = useRef(showOutput);
  showOutputRef.current = showOutput;

  // Zoom state — both state (for re-render of label) and refs (for animation loop)
  const [zoomX, setZoomX] = useState(1);
  const [zoomY, setZoomY] = useState(1);
  const [panX, setPanX] = useState(0.5);
  const zoomXRef = useRef(1);
  const zoomYRef = useRef(1);
  const panXRef = useRef(0.5);

  // Keep refs in sync
  useEffect(() => { zoomXRef.current = zoomX; }, [zoomX]);
  useEffect(() => { zoomYRef.current = zoomY; }, [zoomY]);
  useEffect(() => { panXRef.current = panX; }, [panX]);

  // Cache canvas dimensions to avoid getBoundingClientRect every frame
  const dimsRef = useRef({ w: 0, h: 0 });

  // ResizeObserver to track canvas size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateDims = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      dimsRef.current = { w: rect.width, h: rect.height };
    };

    updateDims();
    const ro = new ResizeObserver(updateDims);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Stable animation loop — runs from mount to unmount, reads refs only
  useEffect(() => {
    const unsubscribe = juceBridge.onWaveformData((data: WaveformData) => {
      preDataRef.current = data.pre;
      postDataRef.current = data.post;
    });

    const animate = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const { w: width, h: height } = dimsRef.current;

          // Reset transform to a known state every frame (avoids cumulative scale)
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, width, height);

          // Grid
          ctx.strokeStyle = GRID_COLOR;
          ctx.lineWidth = 1;
          for (const frac of [0.25, 0.5, 0.75]) {
            ctx.beginPath();
            ctx.moveTo(0, height * frac);
            ctx.lineTo(width, height * frac);
            ctx.stroke();
          }

          // Center line
          ctx.strokeStyle = CENTER_LINE_COLOR;
          ctx.beginPath();
          ctx.moveTo(0, height / 2);
          ctx.lineTo(width, height / 2);
          ctx.stroke();

          const si = showInputRef.current;
          const so = showOutputRef.current;
          const bothVisible = si && so;
          const baseOpacity = bothVisible ? 0.55 : 0.85;

          const zx = zoomXRef.current;
          const zy = zoomYRef.current;
          const px = panXRef.current;

          // Input waveform (silver)
          if (si && preDataRef.current.length > 0) {
            drawWaveform(ctx, preDataRef.current, width, height, `rgba(${INPUT_COLOR_BASE}, ${baseOpacity})`, zx, zy, px);
          }

          // Output waveform (cyan)
          if (so && postDataRef.current.length > 0) {
            drawWaveform(ctx, postDataRef.current, width, height, `rgba(${OUTPUT_COLOR_BASE}, ${baseOpacity})`, zx, zy, px);
          }

          // Zoom label
          if (zx > 1 || zy > 1) {
            ctx.fillStyle = ZOOM_LABEL_COLOR;
            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.fillText(`${zx.toFixed(1)}x / ${zy.toFixed(1)}x`, 4, 10);
          }
        }
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      unsubscribe();
      cancelAnimationFrame(animationRef.current);
    };
  }, []); // stable — never restarts

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
        const visibleRatio = 1 / zoomXRef.current;
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
  }, []);

  const handleDoubleClick = useCallback(() => {
    setZoomX(1);
    setZoomY(1);
    setPanX(0.5);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-crosshair"
      onDoubleClick={handleDoubleClick}
      title="Scroll: zoom | Pinch: amplitude | Shift+scroll: pan | Double-click: reset"
    />
  );
}

/** Pure draw function — no closures over component state */
function drawWaveform(
  ctx: CanvasRenderingContext2D,
  data: number[],
  width: number,
  height: number,
  color: string,
  zoomX: number,
  zoomY: number,
  panX: number,
) {
  const dataLength = data.length;
  if (dataLength === 0) return;

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

    if (barHeight > 0.5) {
      const clippedTop = Math.max(0, centerY - barHeight);
      const clippedBottom = Math.min(height, centerY + barHeight);
      const clippedHeight = clippedBottom - clippedTop;

      if (clippedHeight > 0) {
        ctx.fillRect(i * barWidth, clippedTop, Math.max(barWidth - 1, 1), clippedHeight);
      }
    }
  }
}
