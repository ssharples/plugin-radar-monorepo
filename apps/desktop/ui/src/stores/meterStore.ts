import { create } from 'zustand';
import type { NodeMeterReadings } from '../api/types';

interface MeterState {
  nodeMeterData: Record<string, NodeMeterReadings>;
  peakMeterVersion: number;
}

/**
 * Dedicated store for per-node meter data.
 *
 * Separated from chainStore so that high-frequency meter updates (~30 fps)
 * only trigger selector evaluations in the handful of components that
 * actually display meters, instead of every chainStore subscriber.
 */
export const useMeterStore = create<MeterState>(() => ({
  nodeMeterData: {},
  peakMeterVersion: 0,
}));
