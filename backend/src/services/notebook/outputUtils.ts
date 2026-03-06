export type DecodedDataUrl = {
  mimeType: string;
  buffer: Buffer;
};

export function decodeBase64DataUrl(value: string): DecodedDataUrl | null {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(value);
  if (!match) {
    return null;
  }

  const mimeType = match[1]?.trim();
  if (!mimeType) {
    return null;
  }

  const payload = match[2]?.replace(/\s+/g, '') ?? '';
  if (!payload) {
    return null;
  }

  try {
    const buffer = Buffer.from(payload, 'base64');
    if (buffer.length === 0) {
      return null;
    }
    return { mimeType, buffer };
  } catch {
    return null;
  }
}

export function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();

  switch (normalized) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/svg+xml':
      return 'svg';
    case 'text/html':
      return 'html';
    default:
      return 'bin';
  }
}

