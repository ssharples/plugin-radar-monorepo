import { create } from 'zustand';
import type { MacroUI, MacrosResponse } from '../api/types';
import { juceBridge } from '../api/juce-bridge';

interface MacroState {
  macros: MacroUI[];
  selected: number;
  error: string | null;
  fetchMacros: () => Promise<void>;
  select: (index: number) => void;
  setValue: (index: number, value: number) => void;
  applyValues: (values: number[]) => void;
  addLink: (index: number, nodeId: number, parameterIndex: number) => Promise<boolean>;
  removeLink: (index: number, linkIndex: number) => Promise<void>;
  setLinkRange: (index: number, linkIndex: number, min: number, max: number) => Promise<void>;
  rename: (index: number, name: string) => Promise<void>;
}

export const useMacroStore = create<MacroState>((set, get) => {
  const take = (result: MacrosResponse) => {
    if (result?.success && result.macros) set({ macros: result.macros, error: null });
    else set({ error: result?.error ?? 'Macro change failed' });
    return !!result?.success;
  };

  return {
    macros: [],
    selected: 0,
    error: null,
    fetchMacros: async () => { take(await juceBridge.getMacros()); },
    select: (index) => set({ selected: index }),
    setValue: (index, value) => {
      set({ macros: get().macros.map((m) => (m.index === index ? { ...m, value } : m)) });
      juceBridge.setMacroValue(index, value);
    },
    applyValues: (values) => set({ macros: get().macros.map((m) => ({ ...m, value: values[m.index] ?? m.value })) }),
    addLink: async (index, nodeId, parameterIndex) => take(await juceBridge.addMacroLink(index, nodeId, parameterIndex)),
    removeLink: async (index, linkIndex) => { take(await juceBridge.removeMacroLink(index, linkIndex)); },
    setLinkRange: async (index, linkIndex, min, max) => { take(await juceBridge.setMacroLinkRange(index, linkIndex, min, max)); },
    rename: async (index, name) => { take(await juceBridge.renameMacro(index, name)); },
  };
});
