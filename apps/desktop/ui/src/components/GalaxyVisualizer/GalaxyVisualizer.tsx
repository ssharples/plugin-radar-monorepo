import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { juceBridge } from '../../api/juce-bridge';
import type { FFTData } from '../../api/types';

// ============================================
// Constants
// ============================================
const PARTICLE_COUNT = 20000;
const FFT_BINS = 1024;
const NEON_YELLOW = new THREE.Color('#deff0a');
const WHITE = new THREE.Color('#ffffff');
const DIM_WHITE = new THREE.Color('#667788');
const ROTATION_SPEED = 0.00015;

// ============================================
// Shaders
// ============================================

const vertexShader = /* glsl */ `
  uniform sampler2D uFFTTexture;  // 1024x1 RGBA: R=magL, G=magR
  uniform float uTime;

  attribute float aFreqBin;
  attribute float aBaseRadius;
  attribute float aBaseAngle;
  attribute float aBaseY;
  attribute float aSizeRandom;

  varying float vMagnitude;
  varying float vFreqNorm;
  varying float vAlpha;

  void main() {
    float freqUV = (aFreqBin + 0.5) / 1024.0;
    vec4 fftSample = texture2D(uFFTTexture, vec2(freqUV, 0.5));
    float magL = fftSample.r;
    float magR = fftSample.g;

    float magAvg = (magL + magR) * 0.5;
    float stereoSpread = (magR - magL);

    float freqNorm = aFreqBin / 1024.0;

    // Bass gets more visual boost
    float freqBoost = mix(3.5, 1.0, freqNorm);
    float boostedMag = magAvg * freqBoost;

    // --- RADIUS: galaxy shape at rest, amplitude expands further ---
    float ampRadius = boostedMag * 35.0;
    float radius = aBaseRadius + ampRadius;

    // Stereo offset
    float side = sign(cos(aBaseAngle));
    radius += side * stereoSpread * 15.0;
    radius = max(radius, 0.5);

    float angle = aBaseAngle + uTime * ROTATION_SPEED_VAL;

    float x = cos(angle) * radius;
    float z = sin(angle) * radius;
    float y = aBaseY;

    vec3 pos = vec3(x, y, z);
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    // Small base size — stars are tiny, audio makes them grow
    float baseSize = 0.4 + aSizeRandom * 0.6;
    float ampSize = boostedMag * 8.0;
    gl_PointSize = (baseSize + ampSize) * (200.0 / -mvPosition.z);

    gl_Position = projectionMatrix * mvPosition;

    vMagnitude = boostedMag;
    vFreqNorm = freqNorm;
    // Visible at rest (white stars), brighter with audio
    vAlpha = 0.25 + aSizeRandom * 0.15 + boostedMag * 2.5;
  }
`.replace('ROTATION_SPEED_VAL', ROTATION_SPEED.toFixed(6));

const fragmentShader = /* glsl */ `
  uniform vec3 uColorActive;   // neon yellow — audio-reactive color
  uniform vec3 uColorHigh;     // white — high freq active color
  uniform vec3 uColorIdle;     // dim white/blue-grey — idle star color

  varying float vMagnitude;
  varying float vFreqNorm;
  varying float vAlpha;

  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;

    float softEdge = 1.0 - smoothstep(0.2, 0.5, dist);

    // Idle: dim white stars. Active: transition to neon yellow (low) / white (high)
    vec3 activeColor = mix(uColorActive, uColorHigh, vFreqNorm);
    float activation = clamp(vMagnitude * 6.0, 0.0, 1.0);
    vec3 finalColor = mix(uColorIdle, activeColor, activation);

    // Extra warm glow on bass frequencies when active
    float glow = vMagnitude * (1.0 - vFreqNorm) * 2.0;
    finalColor += uColorActive * glow * 0.3;

    float alpha = clamp(vAlpha, 0.05, 1.0) * softEdge;
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ============================================
// Component
// ============================================
export function GalaxyVisualizer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const fftTextureRef = useRef<THREE.DataTexture | null>(null);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);

  const fftCurrentL = useRef(new Float32Array(FFT_BINS));
  const fftCurrentR = useRef(new Float32Array(FFT_BINS));
  const fftTargetL = useRef(new Float32Array(FFT_BINS));
  const fftTargetR = useRef(new Float32Array(FFT_BINS));

  // RGBA float data: R=magL, G=magR, B=0, A=1 per texel
  const fftTexData = useRef(new Float32Array(FFT_BINS * 4));

  const handleFFTData = useCallback((data: FFTData) => {
    const L = data.magnitudesL ?? data.magnitudes;
    const R = data.magnitudesR ?? data.magnitudes;
    const targetL = fftTargetL.current;
    const targetR = fftTargetR.current;
    const len = Math.min(L.length, FFT_BINS);
    for (let i = 0; i < len; i++) {
      targetL[i] = L[i];
      targetR[i] = R[i];
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Wait a frame for layout to settle
    const initTimeout = requestAnimationFrame(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;

      // ---- Renderer ----
      const renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // ---- Scene ----
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      // ---- Camera ----
      const camera = new THREE.PerspectiveCamera(60, width / height, 1, 1000);
      camera.position.set(0, 0, 80);
      camera.lookAt(0, 0, 0);
      cameraRef.current = camera;

      // ---- FFT DataTexture: 1024x1 RGBA float ----
      const texData = fftTexData.current;
      for (let i = 0; i < FFT_BINS; i++) texData[i * 4 + 3] = 1.0;

      const fftTexture = new THREE.DataTexture(
        texData,
        FFT_BINS,
        1,
        THREE.RGBAFormat,
        THREE.FloatType
      );
      fftTexture.minFilter = THREE.NearestFilter;
      fftTexture.magFilter = THREE.NearestFilter;
      fftTexture.needsUpdate = true;
      fftTextureRef.current = fftTexture;

      // ---- Generate particles ----
      // Distributed in a galaxy disc shape — visible at rest as white star field
      const positions = new Float32Array(PARTICLE_COUNT * 3);
      const freqBins = new Float32Array(PARTICLE_COUNT);
      const baseRadii = new Float32Array(PARTICLE_COUNT);
      const baseAngles = new Float32Array(PARTICLE_COUNT);
      const baseYs = new Float32Array(PARTICLE_COUNT);
      const sizeRandoms = new Float32Array(PARTICLE_COUNT);

      const Y_MIN = -38;
      const Y_RANGE = 76;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const t = i / PARTICLE_COUNT;
        // Steep curve: pack heavily into low frequencies
        const freqBin = Math.floor(Math.pow(t, 0.3) * FFT_BINS);
        freqBins[i] = Math.min(freqBin, FFT_BINS - 1);

        const freqNorm = freqBins[i] / FFT_BINS;

        // Y position: frequency axis with jitter
        const y = Y_MIN + freqNorm * Y_RANGE + (Math.random() - 0.5) * 3.0;

        // Base radius: galaxy disc shape visible at rest
        // Wider spread so stars are visible even with no audio
        const baseR = 3.0 + Math.random() * 12.0 + (1.0 - freqNorm) * 5.0;
        const angle = Math.random() * Math.PI * 2;

        baseRadii[i] = baseR;
        baseAngles[i] = angle;
        baseYs[i] = y;
        sizeRandoms[i] = Math.random();

        positions[i * 3] = Math.cos(angle) * baseR;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = Math.sin(angle) * baseR;
      }

      // ---- Geometry ----
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('aFreqBin', new THREE.BufferAttribute(freqBins, 1));
      geometry.setAttribute('aBaseRadius', new THREE.BufferAttribute(baseRadii, 1));
      geometry.setAttribute('aBaseAngle', new THREE.BufferAttribute(baseAngles, 1));
      geometry.setAttribute('aBaseY', new THREE.BufferAttribute(baseYs, 1));
      geometry.setAttribute('aSizeRandom', new THREE.BufferAttribute(sizeRandoms, 1));

      // ---- Material ----
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uFFTTexture: { value: fftTexture },
          uTime: { value: 0 },
          uColorActive: { value: NEON_YELLOW },
          uColorHigh: { value: WHITE },
          uColorIdle: { value: DIM_WHITE },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      materialRef.current = material;

      const points = new THREE.Points(geometry, material);
      scene.add(points);

      const unsubscribe = juceBridge.onFFTData(handleFFTData);

      // ---- Animation loop ----
      const animate = () => {
        animFrameRef.current = requestAnimationFrame(animate);
        timeRef.current += 1;

        const currentL = fftCurrentL.current;
        const currentR = fftCurrentR.current;
        const targetL = fftTargetL.current;
        const targetR = fftTargetR.current;
        const lerpFactor = 0.18;

        for (let i = 0; i < FFT_BINS; i++) {
          currentL[i] += (targetL[i] - currentL[i]) * lerpFactor;
          currentR[i] += (targetR[i] - currentR[i]) * lerpFactor;
        }

        // Pack into RGBA: R=magL, G=magR
        const td = fftTexData.current;
        for (let i = 0; i < FFT_BINS; i++) {
          td[i * 4]     = currentL[i];
          td[i * 4 + 1] = currentR[i];
        }
        fftTexture.needsUpdate = true;

        material.uniforms.uTime.value = timeRef.current;
        renderer.render(scene, camera);
      };

      animate();

      // Store cleanup refs
      (container as any).__galaxyCleanup = () => {
        cancelAnimationFrame(animFrameRef.current);
        unsubscribe();
        geometry.dispose();
        material.dispose();
        fftTexture.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
        rendererRef.current = null;
        sceneRef.current = null;
        cameraRef.current = null;
        materialRef.current = null;
        fftTextureRef.current = null;
      };
    });

    return () => {
      cancelAnimationFrame(initTimeout);
      const cleanup = (container as any).__galaxyCleanup;
      if (cleanup) {
        cleanup();
        delete (container as any).__galaxyCleanup;
      }
    };
  }, [handleFFTData]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: 'transparent' }}
    />
  );
}
