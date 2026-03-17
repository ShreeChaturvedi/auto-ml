/**
 * PyPI API Client
 *
 * Fetches detailed package information directly from the PyPI JSON API.
 */

/**
 * Detailed package info from PyPI
 */
export interface PyPIPackageDetails {
    name: string;
    version: string;
    summary: string;
    description: string;
    author: string;
    authorEmail: string;
    license: string;
    licenseName: string; // Extracted from classifiers (e.g., "MIT License")
    homepage: string;
    projectUrl: string;
    packageUrl: string;
    requiresPython: string;
    pythonVersions: string[]; // Extracted from classifiers (e.g., ["3.10", "3.11", "3.12"])
    keywords: string[];
    classifiers: string[];
    size: number; // bytes
    uploadTime: string;
}

/**
 * Fetch detailed package info directly from PyPI JSON API
 */
export async function fetchPyPIPackageDetails(
    packageName: string,
    version?: string
): Promise<PyPIPackageDetails | null> {
    try {
        const url = version
            ? `https://pypi.org/pypi/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}/json`
            : `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;

        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        const info = data.info;

        // Get the latest release file size
        let size = 0;
        const releases = data.urls || [];
        if (releases.length > 0) {
            // Prefer wheel, then source dist
            const wheel = releases.find((r: { packagetype: string }) => r.packagetype === 'bdist_wheel');
            const sdist = releases.find((r: { packagetype: string }) => r.packagetype === 'sdist');
            const release = wheel || sdist || releases[0];
            size = release?.size || 0;
        }

        // Extract Python versions from classifiers
        // e.g., "Programming Language :: Python :: 3.11" -> "3.11"
        const classifiers: string[] = info.classifiers || [];
        const pythonVersions: string[] = [];
        for (const classifier of classifiers) {
            const match = classifier.match(/^Programming Language :: Python :: (\d+\.\d+)$/);
            if (match) {
                pythonVersions.push(match[1]);
            }
        }
        // Sort versions numerically
        pythonVersions.sort((a, b) => {
            const [aMajor, aMinor] = a.split('.').map(Number);
            const [bMajor, bMinor] = b.split('.').map(Number);
            return aMajor !== bMajor ? aMajor - bMajor : aMinor - bMinor;
        });

        // Extract license name from classifiers
        // e.g., "License :: OSI Approved :: MIT License" -> "MIT License"
        let licenseName = '';
        for (const classifier of classifiers) {
            if (classifier.startsWith('License :: ')) {
                // Get the last part after ::
                const parts = classifier.split(' :: ');
                licenseName = parts[parts.length - 1];
                break;
            }
        }
        // Fallback to license field if it's short (just a name, not full text)
        if (!licenseName && info.license && info.license.length < 50) {
            licenseName = info.license;
        }

        return {
            name: info.name || packageName,
            version: info.version || '',
            summary: info.summary || '',
            description: info.description || '',
            author: info.author || '',
            authorEmail: info.author_email || '',
            license: info.license || '',
            licenseName,
            homepage: info.home_page || info.project_url || '',
            projectUrl: info.project_url || `https://pypi.org/project/${packageName}/`,
            packageUrl: info.package_url || `https://pypi.org/project/${packageName}/`,
            requiresPython: info.requires_python || '',
            pythonVersions,
            keywords: info.keywords ? info.keywords.split(',').map((k: string) => k.trim()).filter(Boolean) : [],
            classifiers,
            size,
            uploadTime: releases[0]?.upload_time || ''
        };
    } catch (error) {
        console.warn('[execution] Failed to fetch PyPI package details:', error);
        return null;
    }
}
