import { create } from 'zustand';
import { persist, type PersistOptions } from 'zustand/middleware';
import type { StateCreator } from 'zustand';

/**
 * Factory function for creating persisted Zustand stores with consistent configuration.
 *
 * Standardizes:
 * - Storage key naming: `automl-${name}-v${version}` (or custom fullName if provided)
 * - Selective field persistence via partialize
 * - Optional version migration
 * - Optional custom merge logic
 */
export function createPersistedStore<T>(
  name: string,
  createState: StateCreator<T, [['zustand/persist', unknown]], []>,
  partialize?: (state: T) => Partial<T>,
  options?: {
    version?: number;
    merge?: (persistedState: unknown, currentState: T) => T;
    migrate?: (persistedState: unknown, version: number) => Partial<T>;
    /** Override the generated storage key name for backward compatibility */
    fullName?: string;
  }
) {
  const version = options?.version ?? 1;
  const storageName = options?.fullName ?? `automl-${name}-v${version}`;

  const persistConfig: PersistOptions<T, Partial<T>> = {
    name: storageName,
    version,
    ...(partialize && { partialize }),
    ...(options?.merge && { merge: options.merge }),
    ...(options?.migrate && { migrate: options.migrate })
  };

  return create<T>()(persist(createState, persistConfig));
}
