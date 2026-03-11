import type { PythonVersion } from '../../types/execution.js';

export interface ContainerConfig {
    projectId: string;
    pythonVersion: PythonVersion;
    datasetPaths?: string[];
    workspacePath: string;
}

export interface Container {
    id: string;
    containerId: string;
    projectId: string;
    pythonVersion: PythonVersion;
    workspacePath: string;
    kernelGatewayPort: number;
    createdAt: Date;
    lastUsedAt: Date;
}
