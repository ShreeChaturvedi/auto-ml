/**
 * Execution Store
 *
 * Zustand store for managing Python code execution state.
 * Uses cloud (Docker) execution exclusively.
 */

import { create } from 'zustand';
import type { ExecutionResult, PackageInfo, PackageInstallEvent, PythonVersion } from '@/lib/api/execution';
import * as executionApi from '@/lib/api/execution';

interface ExecutionState {
  // Runtime configuration
  pythonVersion: PythonVersion;

  // Cloud state
  cloudAvailable: boolean;
  cloudInitializing: boolean;
  sessionId: string | null;

  // Package management
  installedPackages: PackageInfo[];
  installingPackage: boolean;

  // Execution state
  isExecuting: boolean;
  lastResult: ExecutionResult | null;

  // Actions
  setPythonVersion: (version: PythonVersion) => void;
  initializeCloud: (projectId: string) => Promise<void>;
  executeCode: (code: string, projectId: string) => Promise<ExecutionResult>;
  installPackage: (
    packageName: string,
    projectId: string,
    options?: { onEvent?: (event: PackageInstallEvent) => void }
  ) => Promise<{ success: boolean; message: string }>;
  refreshPackages: () => Promise<void>;
  checkCloudHealth: () => Promise<void>;
  reset: () => void;
}

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  // Initial state
  pythonVersion: '3.11',
  cloudAvailable: false,
  cloudInitializing: false,
  sessionId: null,
  installedPackages: [],
  installingPackage: false,
  isExecuting: false,
  lastResult: null,

  setPythonVersion: (pythonVersion) => {
    set({ pythonVersion });
    // Clear session when changing Python version
    if (get().sessionId) {
      set({ sessionId: null });
    }
  },

  initializeCloud: async (projectId) => {
    const { pythonVersion, cloudAvailable: isCloudAvailable } = get();
    if (get().cloudInitializing) {
      return;
    }

    set({ cloudInitializing: true });

    try {
      const session = await Promise.race([
        executionApi.createSession(projectId, pythonVersion),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Cloud runtime initialization timed out.')), 120000)
        )
      ]);
      set({
        sessionId: session.id,
        installedPackages: session.installedPackages ?? [],
        cloudAvailable: true,
        cloudInitializing: false
      });

      console.log('[executionStore] Cloud session created:', session.id);
    } catch (error) {
      console.error('[executionStore] Cloud initialization failed:', error);
      set({
        cloudAvailable: isCloudAvailable,
        cloudInitializing: false,
        sessionId: null
      });
      throw error;
    }
  },

  executeCode: async (code, projectId) => {
    const { sessionId, pythonVersion } = get();

    console.log('[executionStore] executeCode called');
    set({ isExecuting: true, lastResult: null });

    try {
      // Ensure cloud session exists
      if (!sessionId) {
        await get().initializeCloud(projectId);
      }

      const activeSessionId = get().sessionId;
      if (!activeSessionId) {
        throw new Error('Cloud runtime session is unavailable. Please ensure Docker is running.');
      }

      const result = await executionApi.executeCode({
        projectId,
        code,
        sessionId: activeSessionId,
        pythonVersion
      });

      set({ lastResult: result, isExecuting: false });
      return result;
    } catch (error) {
      const errorResult: ExecutionResult = {
        status: 'error',
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        outputs: [{
          type: 'error' as const,
          content: error instanceof Error ? error.message : 'Execution failed'
        }],
        executionMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      set({ lastResult: errorResult, isExecuting: false });
      return errorResult;
    }
  },

  installPackage: async (packageName, projectId, options) => {
    const { sessionId } = get();
    const onEvent = options?.onEvent;

    set({ installingPackage: true });

    try {
      // Ensure cloud session exists
      if (!sessionId) {
        await get().initializeCloud(projectId);
      }

      const activeSessionId = get().sessionId;
      if (!activeSessionId) {
        const result = { success: false, message: 'No active cloud session' };
        onEvent?.({ type: 'done', success: false, message: result.message });
        set({ installingPackage: false });
        return result;
      }

      const result = await executionApi.installPackageStream(activeSessionId, packageName, (event) => {
        onEvent?.(event);
      });

      if (result.success) {
        const packages = await executionApi.listPackages(activeSessionId);
        set({ installedPackages: packages });
        onEvent?.({ type: 'progress', progress: 100, stage: 'Completed' });
      }

      set({ installingPackage: false });
      return result;
    } catch (error) {
      set({ installingPackage: false });
      onEvent?.({
        type: 'done',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to install package'
      });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to install package'
      };
    }
  },

  refreshPackages: async () => {
    const { sessionId } = get();

    if (!sessionId) {
      return;
    }

    try {
      const packages = await executionApi.listPackages(sessionId);
      set({ installedPackages: packages });
    } catch (error) {
      console.error('[executionStore] Failed to refresh packages:', error);
    }
  },

  checkCloudHealth: async () => {
    try {
      const health = await executionApi.getExecutionHealth();
      set({ cloudAvailable: health.dockerAvailable });
    } catch {
      set({ cloudAvailable: false });
    }
  },

  reset: () => {
    set({
      pythonVersion: '3.11',
      sessionId: null,
      installedPackages: [],
      cloudInitializing: false,
      isExecuting: false,
      lastResult: null
    });
  }
}));

// Re-export types for convenience
export type { ExecutionResult, PackageInfo, PackageInstallEvent, PythonVersion };
