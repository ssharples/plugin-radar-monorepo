import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { juceBridge } from '../../api/juce-bridge';
import type { FFTData } from '../../api/types';

// ============================================
// Constants
// ============================================
const PARTICLE_COUNT = 6000;
const FFT_BINS = 1024;
const NEON_YELLOW = new THREE.Color('#deff0a');
const WHITE = new THREE.Color('#ffffff');
const DIM_BLUE = new THREE.Color('#334466');
const ROTATION_SPEED = 0.00015; // Very slow rotation

// ============================================
// Shaders
// ============================================
const vertexShader = /* glsl */ `
  uniform sampler2D uFFTTexture;    // 1024x2 float texture (row0=L, row1=R)
  uniform float uTime;

  attribute float aFreqBin;         // Which FFT bin this particle maps to (0-1023)
  attribute float aBaseRadius;      // Base radial distance from center
  attribute float aBaseAngle;       // Base angle in the galaxy disc
  attribute float aBaseY;           // Base Y position (frequency axis)
  attribute float aSizeRandom;      // Random size variation

  varying float vMagnitude;         // Pass magnitude to fragment
  varying float vFreqNorm;          // Normalized frequency (0=bass, 1=highs)
  varying float vAlpha;

  void main() {
    // Read L and R magnitudes from the DataTexture
    float freqUV = aFreqBin / 1024.0;
    float magL = texture2D(uFFTTexture, vec2(freqUV, 0.25)).r;
    float magR = texture2D(uFFTTexture, vec2(freqUV, 0.75)).r;

    float magAvg = (magL + magR) * 0.5;
    float stereoSpread = (magR - magL);  // Negative = left, positive = right

    // Frequency-based scaling: bass bins get more energy amplification
    float freqNorm = aFreqBin / 1024.0;
    float freqBoost = mix(3.0, 0.8, freqNorm);  // Bass gets 3x, highs get 0.8x
    float boostedMag = magAvg * freqBoost;

    // Position: galaxy disc layout
    // X = radial position + stereo offset
    // Y = frequency (bass at bottom, highs at top) + amplitude push
    // Z = depth from amplitude
    float radius = aBaseRadius + stereoSpread * 40.0;
    float angle = aBaseAngle + uTime * ROTATION_SPEED_VAL;

    float x = cos(angle) * radius;
    float z = sin(angle) * radius;
    float y = aBaseY + boostedMag * 15.0;  // Amplitude lifts particles

    // Add subtle depth push from amplitude
    z += boostedMag * 8.0;

    vec3 pos = vec3(x, y, z);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    // Point size: base + amplitude boost
    float baseSize = 1.5 + aSizeRandom * 1.5;
    float ampSize = boostedMag * 12.0;
    gl_PointSize = (baseSize + ampSize) * (200.0 / -mvPosition.z);

    gl_Position = projectionMatrix * mvPosition;

    vMagnitude = boostedMag;
    vFreqNorm = freqNorm;
    vAlpha = 0.15 + boostedMag * 2.5;  // Dim when silent, bright when active
  }
`.replace('ROTATION_SPEED_VAL', ROTATION_SPEED.toFixed(6));

const fragmentShader = /* glsl */ `
  uniform vec3 uColorLow;    // Neon yellow for bass
  uniform vec3 uColorHigh;   // White for highs
  uniform vec3 uColorDim;    // Dim blue for inactive

  varying float vMagnitude;
  varying float vFreqNorm;
  varying float vAlpha;

  void main() {
    // Circular point shape with soft edge
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;

    float softEdge = 1.0 - smoothstep(0.3, 0.5, dist);

    // Color: blend from neon yellow (bass) to white (highs)
    // When inactive, dim toward blue-gray
    vec3 activeColor = mix(uColorLow, uColorHigh, vFreqNorm);
    vec3 finalColor = mix(uColorDim, activeColor, clamp(vMagnitude * 4.0, 0.0, 1.0));

    // Glow effect for active bass particles
    float glow = vMagnitude * (1.0 - vFreqNorm) * 2.0;
    finalColor += uColorLow * glow * 0.3;

    float alpha = clamp(vAlpha, 0.05, 1.0) * softEdge;
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ============================================
// Galaxy Visualizer Component
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

  // FFT data buffers with lerp interpolation
  const fftCurrentL = useRef(new Float32Array(FFT_BINS));
  const fftCurrentR = useRef(new Float32Array(FFT_BINS));
  const fftTargetL = useRef(new Float32Array(FFT_BINS));
  const fftTargetR = useRef(new Float32Array(FFT_BINS));

  // Handle incoming FFT data at 30Hz
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

    const width = container.clientWidth;
    const height = container.clientHeight;

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
    camera.position.set(0, 30, 120);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // ---- FFT DataTexture (1024 x 2, R32F) ----
    const fftData = new Float32Array(FFT_BINS * 2); // Row 0 = L, Row 1 = R
    const fftTexture = new THREE.DataTexture(
      fftData,
      FFT_BINS,
      2,
      THREE.RedFormat,
      THREE.FloatType
    );
    fftTexture.minFilter = THREE.LinearFilter;
    fftTexture.magFilter = THREE.LinearFilter;
    fftTexture.needsUpdate = true;
    fftTextureRef.current = fftTexture;

    // ---- Generate particle attributes ----
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const freqBins = new Float32Array(PARTICLE_COUNT);
    const baseRadii = new Float32Array(PARTICLE_COUNT);
    const baseAngles = new Float32Array(PARTICLE_COUNT);
    const baseYs = new Float32Array(PARTICLE_COUNT);
    const sizeRandoms = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Map particle to frequency bin: weighted distribution
      // More particles for bass (perceptually important)
      const t = i / PARTICLE_COUNT;
      const freqBin = Math.floor(Math.pow(t, 0.6) * FFT_BINS);
      freqBins[i] = Math.min(freqBin, FFT_BINS - 1);

      // Galaxy disc layout
      const freqNorm = freqBins[i] / FFT_BINS;
      const radius = 10 + freqNorm * 70 + (Math.random() - 0.5) * 15;
      const angle = Math.random() * Math.PI * 2;

      // Y position maps to frequency (bass at bottom, highs at top)
      // With some spiral arm structure
      const spiralOffset = Math.sin(angle * 2 + freqNorm * 4) * 5;
      const y = -30 + freqNorm * 60 + spiralOffset + (Math.random() - 0.5) * 8;

      baseRadii[i] = radius;
      baseAngles[i] = angle;
      baseYs[i] = y;
      sizeRandoms[i] = Math.random();

      // Initial position (will be overridden by shader)
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
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
        uColorLow: { value: NEON_YELLOW },
        uColorHigh: { value: WHITE },
        uColorDim: { value: DIM_BLUE },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    materialRef.current = material;

    // ---- Points ----
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // ---- FFT subscription ----
    const unsubscribe = juceBridge.onFFTData(handleFFTData);

    // ---- Animation loop ----
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      timeRef.current += 1;

      // Lerp FFT data (smooth 30Hz → 60fps)
      const currentL = fftCurrentL.current;
      const currentR = fftCurrentR.current;
      const targetL = fftTargetL.current;
      const targetR = fftTargetR.current;
      const lerpFactor = 0.25;

      for (let i = 0; i < FFT_BINS; i++) {
        currentL[i] += (targetL[i] - currentL[i]) * lerpFactor;
        currentR[i] += (targetR[i] - currentR[i]) * lerpFactor;
      }

      // Update DataTexture
      const texData = fftTexture.image.data as Float32Array;
      texData.set(currentL, 0);
      texData.set(currentR, FFT_BINS);
      fftTexture.needsUpdate = true;

      // Update time uniform
      material.uniforms.uTime.value = timeRef.current;

      renderer.render(scene, camera);
    };

    animate();

    // ---- Cleanup ----
    return () => {
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
  }, [handleFFTData]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: 'transparent' }}
    />
  );
}
