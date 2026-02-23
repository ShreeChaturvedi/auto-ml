/**
 * Execution Types
 * 
 * Types for Python code execution infrastructure.
 */

export type ExecutionMode = 'browser' | 'cloud';
export type PythonVersion = '3.10' | '3.11';
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'timeout';

export interface ExecutionRequest {
  projectId: string;
  code: string;
  sessionId?: string;
  pythonVersion?: PythonVersion;
  timeout?: number; // ms, default 30000
}

export interface RichOutput {
  type: 'text' | 'table' | 'image' | 'html' | 'error' | 'chart';
  content: string;
  data?: unknown;
  mimeType?: string;
}

export interface ExecutionResult {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  outputs: RichOutput[];
  executionMs: number;
  error?: string;
}

export interface ExecutionSession {
  id: string;
  projectId: string;
  containerId?: string;
  workspacePath?: string;
  pythonVersion: PythonVersion;
  installedPackages: PackageInfo[];
  createdAt: Date;
  lastUsedAt: Date;
}

export interface PackageInfo {
  name: string;
  version?: string;
  summary?: string;
  homepage?: string;
}

export interface RuntimeInfo {
  pythonVersion: PythonVersion;
  available: boolean;
  preinstalledPackages: string[];
}

// Default packages pre-installed in Python runtime
export const DEFAULT_PACKAGES = [
  'numpy',
  'pandas',
  'scikit-learn',
  'matplotlib',
  'seaborn',
  'scipy',
  'plotly'
];

// Execution limits
export const EXECUTION_LIMITS = {
  defaultTimeoutMs: 30000,
  maxTimeoutMs: 300000,
  maxOutputBytes: 10 * 1024 * 1024, // 10MB
  maxMemoryMb: 2048,
  maxCpuPercent: 100
};
