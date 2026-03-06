import { describe, expect, it } from 'vitest';

import { decodeBase64DataUrl, extensionForMimeType } from './outputUtils.js';

describe('decodeBase64DataUrl', () => {
  it('decodes a base64 PNG data URL', () => {
    const base64Png1x1 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X9Z1cAAAAASUVORK5CYII=';
    const dataUrl = `data:image/png;base64,${base64Png1x1}`;

    const decoded = decodeBase64DataUrl(dataUrl);
    expect(decoded).not.toBeNull();
    expect(decoded?.mimeType).toBe('image/png');

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(decoded?.buffer.slice(0, pngHeader.length)).toEqual(pngHeader);
  });

  it('returns null for non-data URLs', () => {
    expect(decodeBase64DataUrl('not-a-data-url')).toBeNull();
  });
});

describe('extensionForMimeType', () => {
  it('maps common image mime types', () => {
    expect(extensionForMimeType('image/png')).toBe('png');
    expect(extensionForMimeType('image/svg+xml')).toBe('svg');
    expect(extensionForMimeType('image/jpeg')).toBe('jpg');
  });
});

