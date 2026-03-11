export type PackageInstallEvent = {
    type: 'progress' | 'log';
    progress?: number;
    stage?: string;
    message?: string;
};
