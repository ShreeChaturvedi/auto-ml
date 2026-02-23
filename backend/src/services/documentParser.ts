const MIME_TEXT = new Set([
  'text/plain',
  'text/markdown',
  'text/md',
  'text/x-markdown',
  'text/html',
  'application/json'
]);

export type SupportedDocumentType = 'pdf' | 'markdown' | 'text' | 'unknown';

export interface ParsedDocument {
  text: string;
  mimeType: string;
  type: SupportedDocumentType;
  parseError?: string;
}

export async function parseDocument(buffer: Buffer, mimeType?: string): Promise<ParsedDocument> {
  if (mimeType?.includes('pdf')) {
    const { text, parseError } = await parsePdfBuffer(buffer);
    return {
      text,
      mimeType: mimeType ?? 'application/pdf',
      type: 'pdf',
      parseError
    };
  }

  if (mimeType && MIME_TEXT.has(mimeType)) {
    return {
      text: buffer.toString('utf8'),
      mimeType,
      type: mimeType.includes('markdown') ? 'markdown' : 'text'
    };
  }

  // Fallback: try to decode as UTF-8 text
  const text = buffer.toString('utf8');
  return {
    text,
    mimeType: mimeType ?? 'text/plain',
    type: text ? 'text' : 'unknown'
  };
}

/**
 * Parse PDF buffer using pdf-parse v2 API
 * pdf-parse v2 exports PDFParse class that needs to be instantiated
 */
async function parsePdfBuffer(buffer: Buffer): Promise<{ text: string; parseError?: string }> {
  await ensurePdfDomPolyfills();
  const primaryAttempt = await parsePdfWithPdfParse(buffer).catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[documentParser] PDFParse failed:', message);
    return { text: '', parseError: message };
  });

  if (primaryAttempt.text) {
    return primaryAttempt;
  }

  const fallbackAttempt = await parsePdfWithPdfjs(buffer).catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[documentParser] PDF.js fallback failed:', message);
    return { text: '', parseError: message };
  });

  if (fallbackAttempt.text) {
    return fallbackAttempt;
  }

  return {
    text: '',
    parseError: primaryAttempt.parseError || fallbackAttempt.parseError || 'No text extracted from PDF'
  };
}

async function ensurePdfDomPolyfills(): Promise<void> {
  if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix !== 'undefined') {
    return;
  }

  try {
    const canvas = await import('@napi-rs/canvas');
    const domMatrix = canvas.DOMMatrix;
    const domPoint = canvas.DOMPoint;
    const domRect = canvas.DOMRect;

    if (domMatrix && typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
      (globalThis as { DOMMatrix?: unknown }).DOMMatrix = domMatrix;
    }
    if (domPoint && typeof (globalThis as { DOMPoint?: unknown }).DOMPoint === 'undefined') {
      (globalThis as { DOMPoint?: unknown }).DOMPoint = domPoint;
    }
    if (domRect && typeof (globalThis as { DOMRect?: unknown }).DOMRect === 'undefined') {
      (globalThis as { DOMRect?: unknown }).DOMRect = domRect;
    }
  } catch (error) {
    console.warn('[documentParser] DOMMatrix polyfill failed:', error);
  }

  if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
    class DOMMatrixPolyfill {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;

      constructor(init?: unknown) {
        const values = DOMMatrixPolyfill.resolve(init);
        if (values) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = values;
        }
      }

      static resolve(input?: unknown): [number, number, number, number, number, number] | null {
        if (!input) return null;
        if (Array.isArray(input) && input.length >= 6) {
          return input.slice(0, 6).map((value) => Number(value)) as [
            number,
            number,
            number,
            number,
            number,
            number
          ];
        }
        if (typeof input === 'object') {
          const candidate = input as {
            a?: number;
            b?: number;
            c?: number;
            d?: number;
            e?: number;
            f?: number;
            m11?: number;
            m12?: number;
            m21?: number;
            m22?: number;
            m41?: number;
            m42?: number;
          };
          if (
            typeof candidate.a === 'number' ||
            typeof candidate.m11 === 'number'
          ) {
            return [
              Number(candidate.a ?? candidate.m11 ?? 1),
              Number(candidate.b ?? candidate.m12 ?? 0),
              Number(candidate.c ?? candidate.m21 ?? 0),
              Number(candidate.d ?? candidate.m22 ?? 1),
              Number(candidate.e ?? candidate.m41 ?? 0),
              Number(candidate.f ?? candidate.m42 ?? 0)
            ];
          }
        }
        return null;
      }

      static fromMatrix(other?: unknown) {
        return new DOMMatrixPolyfill(other);
      }

      get isIdentity() {
        return (
          this.a === 1 &&
          this.b === 0 &&
          this.c === 0 &&
          this.d === 1 &&
          this.e === 0 &&
          this.f === 0
        );
      }

      multiplySelf(other?: unknown) {
        const values = DOMMatrixPolyfill.resolve(other) ?? [1, 0, 0, 1, 0, 0];
        const [a, b, c, d, e, f] = values;
        const nextA = this.a * a + this.c * b;
        const nextB = this.b * a + this.d * b;
        const nextC = this.a * c + this.c * d;
        const nextD = this.b * c + this.d * d;
        const nextE = this.a * e + this.c * f + this.e;
        const nextF = this.b * e + this.d * f + this.f;
        this.a = nextA;
        this.b = nextB;
        this.c = nextC;
        this.d = nextD;
        this.e = nextE;
        this.f = nextF;
        return this;
      }

      preMultiplySelf(other?: unknown) {
        const values = DOMMatrixPolyfill.resolve(other) ?? [1, 0, 0, 1, 0, 0];
        const [a, b, c, d, e, f] = values;
        const nextA = a * this.a + c * this.b;
        const nextB = b * this.a + d * this.b;
        const nextC = a * this.c + c * this.d;
        const nextD = b * this.c + d * this.d;
        const nextE = a * this.e + c * this.f + e;
        const nextF = b * this.e + d * this.f + f;
        this.a = nextA;
        this.b = nextB;
        this.c = nextC;
        this.d = nextD;
        this.e = nextE;
        this.f = nextF;
        return this;
      }

      invertSelf() {
        const det = this.a * this.d - this.b * this.c;
        if (!det) {
          this.a = 1;
          this.b = 0;
          this.c = 0;
          this.d = 1;
          this.e = 0;
          this.f = 0;
          return this;
        }
        const nextA = this.d / det;
        const nextB = -this.b / det;
        const nextC = -this.c / det;
        const nextD = this.a / det;
        const nextE = (this.c * this.f - this.d * this.e) / det;
        const nextF = (this.b * this.e - this.a * this.f) / det;
        this.a = nextA;
        this.b = nextB;
        this.c = nextC;
        this.d = nextD;
        this.e = nextE;
        this.f = nextF;
        return this;
      }

      translate(tx = 0, ty = 0) {
        return this.multiplySelf([1, 0, 0, 1, tx, ty]);
      }

      scale(scaleX = 1, scaleY = scaleX) {
        return this.multiplySelf([scaleX, 0, 0, scaleY, 0, 0]);
      }
    }

    (globalThis as { DOMMatrix?: unknown }).DOMMatrix = DOMMatrixPolyfill;
  }
}

async function parsePdfWithPdfParse(buffer: Buffer): Promise<{ text: string; parseError?: string }> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return { text: result.text ?? '' };
  } finally {
    await parser.destroy();
  }
}

async function parsePdfWithPdfjs(buffer: Buffer): Promise<{ text: string; parseError?: string }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data, disableWorker: true });
  const doc = await loadingTask.promise;
  let text = '';

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: { str?: string }) => item.str ?? '')
        .join(' ');
      text += `${pageText}\n`;
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return { text: text.trim() };
}
