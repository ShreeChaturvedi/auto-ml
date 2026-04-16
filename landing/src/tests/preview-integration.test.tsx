import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppPreviewFrame from '@/components/AppPreviewFrame';
import { previewAssetVersion } from '@/components/previews/generatedPreviewVersion';

function versionedPreviewPath(fileName: string): string {
  return `/previews/${fileName}?v=${previewAssetVersion}`;
}

describe('AppPreviewFrame integration', () => {
  it('renders the preview frame wrapper with aria-label', () => {
    const { container } = render(<AppPreviewFrame />);
    const frame = container.querySelector('[aria-label^="Interactive Agentic AutoML"]');
    expect(frame).toBeInTheDocument();
  });

  it('mounts the media-backed hero preview loop with both video sources', () => {
    const { container } = render(<AppPreviewFrame />);
    const preview = screen.getByTestId('hero-preview-loop');
    const video = container.querySelector('video[aria-label*="workflow montage"]');

    expect(preview).toBeInTheDocument();
    expect(video).toBeInTheDocument();
    expect(video?.getAttribute('poster')).toBe(
      versionedPreviewPath('hero-montage.webp'),
    );
    expect(video?.querySelector('source[type="video/webm"]')).toHaveAttribute(
      'src',
      versionedPreviewPath('hero-montage.webm'),
    );
    expect(video?.querySelector('source[type="video/mp4"]')).toHaveAttribute(
      'src',
      versionedPreviewPath('hero-montage.mp4'),
    );
  });

  it('ships zero iframes in the hero', () => {
    const { container } = render(<AppPreviewFrame />);
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
  });
});
