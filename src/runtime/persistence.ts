/** Settings-backed persistence for token-poker. */
import type { PluginInvocationContext } from "@ericsanchezok/synergy-plugin";
import type { GameSnapshot } from "../engine/game";

export const SCHEMA_VERSION = 1;

export interface StoredState {
  schemaVersion: number;
  user: { name: string };
  balance: number;
  stats: { hands: number; won: number; net: number };
  recovery: GameSnapshot | null;
  ai: { frequency: "all" | "low" | "off"; modelRole: "nano" | "mini" };
  roster: Record<string, string>;
}

export function defaultState(): StoredState {
  return {
    schemaVersion: SCHEMA_VERSION,
    user: { name: "你" },
    balance: 100_000,
    stats: { hands: 0, won: 0, net: 0 },
    recovery: null,
    ai: { frequency: "all", modelRole: "mini" },
    roster: {},
  };
}

export async function loadState(
  context: PluginInvocationContext,
): Promise<StoredState> {
  const raw = (await context.settings?.get?.()) ?? {};
  const merged = { ...defaultState(), ...(raw as Partial<StoredState>) };
  // Normalize nested objects defensively.
  return {
    ...merged,
    schemaVersion: SCHEMA_VERSION,
    user: { ...defaultState().user, ...(merged.user ?? {}) },
    stats: { ...defaultState().stats, ...(merged.stats ?? {}) },
    ai: { ...defaultState().ai, ...(merged.ai ?? {}) },
    roster: { ...(merged.roster ?? {}) },
  };
}

export async function saveState(
  context: PluginInvocationContext,
  state: StoredState,
): Promise<void> {
  await context.settings?.replace?.(
    state as unknown as Record<string, unknown>,
  );
}
