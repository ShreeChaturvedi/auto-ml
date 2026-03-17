import { describe, it, expect } from 'vitest';

import { translateMimeBundle, type MimeBundle } from './mimeTranslator.js';

describe('translateMimeBundle', () => {
    /* -------------------------------------------------------------- */
    /*  1. Plotly JSON                                                 */
    /* -------------------------------------------------------------- */

    describe('application/vnd.plotly.v1+json', () => {
        it('converts a plotly object value to a chart RichOutput', () => {
            const plotlyData = {
                data: [{ x: [1, 2, 3], y: [4, 5, 6], type: 'scatter' }],
                layout: { title: 'Test' },
            };
            const bundle: MimeBundle = { 'application/vnd.plotly.v1+json': plotlyData };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({ type: 'chart', content: '', data: plotlyData });
        });

        it('parses a JSON string value for plotly data', () => {
            const plotlyData = {
                data: [{ x: [1], y: [2], type: 'bar' }],
                layout: {},
            };
            const bundle: MimeBundle = {
                'application/vnd.plotly.v1+json': JSON.stringify(plotlyData),
            };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({ type: 'chart', content: '', data: plotlyData });
        });
    });

    /* -------------------------------------------------------------- */
    /*  2. PNG image                                                   */
    /* -------------------------------------------------------------- */

    describe('image/png', () => {
        it('converts a base64 PNG to an image RichOutput with data URI', () => {
            const bundle: MimeBundle = { 'image/png': 'iVBORw0KGgoAAAANSUhEUg==' };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({
                type: 'image',
                content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
                mimeType: 'image/png',
            });
        });

        it('strips whitespace and newlines from base64 PNG data', () => {
            const bundle: MimeBundle = {
                'image/png': 'iVBORw0K\nGgoAAAAN\n  SUhEUg==\n',
            };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({
                type: 'image',
                content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
                mimeType: 'image/png',
            });
        });
    });

    /* -------------------------------------------------------------- */
    /*  3. JPEG image                                                  */
    /* -------------------------------------------------------------- */

    describe('image/jpeg', () => {
        it('converts a base64 JPEG to an image RichOutput with data URI', () => {
            const bundle: MimeBundle = { 'image/jpeg': '/9j/4AAQSkZJRg==' };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({
                type: 'image',
                content: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
                mimeType: 'image/jpeg',
            });
        });

        it('strips whitespace and newlines from base64 JPEG data', () => {
            const bundle: MimeBundle = {
                'image/jpeg': '/9j/4A\n AQSk\r\n ZJRg==',
            };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({
                type: 'image',
                content: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
                mimeType: 'image/jpeg',
            });
        });
    });

    /* -------------------------------------------------------------- */
    /*  4. HTML                                                        */
    /* -------------------------------------------------------------- */

    describe('text/html', () => {
        it('converts HTML content to an html RichOutput', () => {
            const html = '<table><tr><td>value</td></tr></table>';
            const bundle: MimeBundle = { 'text/html': html };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({ type: 'html', content: html });
        });

        it('handles complex styled HTML from DataFrame rendering', () => {
            const html =
                '<style>.df { border: 1px solid; }</style><div class="df"><table><tr><th>col</th></tr></table></div>';
            const bundle: MimeBundle = { 'text/html': html };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({ type: 'html', content: html });
        });
    });

    /* -------------------------------------------------------------- */
    /*  5. SVG                                                         */
    /* -------------------------------------------------------------- */

    describe('image/svg+xml', () => {
        it('converts SVG content to an html RichOutput', () => {
            const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>';
            const bundle: MimeBundle = { 'image/svg+xml': svg };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({ type: 'html', content: svg });
        });
    });

    /* -------------------------------------------------------------- */
    /*  6. LaTeX                                                       */
    /* -------------------------------------------------------------- */

    describe('text/latex', () => {
        it('wraps LaTeX content in display-math delimiters', () => {
            const latex = '\\frac{a}{b}';
            const bundle: MimeBundle = { 'text/latex': latex };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({ type: 'html', content: '$$\\frac{a}{b}$$' });
        });

        it('handles an already-delimited LaTeX expression', () => {
            const latex = '$$x^2$$';
            const bundle: MimeBundle = { 'text/latex': latex };

            const result = translateMimeBundle(bundle);

            // The function unconditionally wraps, so expect double-delimited
            expect(result).toEqual({ type: 'html', content: '$$$$x^2$$$$' });
        });
    });

    /* -------------------------------------------------------------- */
    /*  7. Plain text                                                  */
    /* -------------------------------------------------------------- */

    describe('text/plain', () => {
        it('converts plain text to a text RichOutput', () => {
            const bundle: MimeBundle = { 'text/plain': 'Hello, world!' };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({ type: 'text', content: 'Hello, world!' });
        });

        it('handles multiline plain text', () => {
            const text = 'line1\nline2\nline3';
            const bundle: MimeBundle = { 'text/plain': text };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({ type: 'text', content: text });
        });
    });

    /* -------------------------------------------------------------- */
    /*  8. Priority ordering                                           */
    /* -------------------------------------------------------------- */

    describe('priority ordering', () => {
        it('picks plotly over all other types', () => {
            const plotlyData = { data: [], layout: {} };
            const bundle: MimeBundle = {
                'text/plain': 'fallback',
                'text/html': '<b>html</b>',
                'image/png': 'base64png',
                'application/vnd.plotly.v1+json': plotlyData,
            };

            const result = translateMimeBundle(bundle);

            expect(result.type).toBe('chart');
            expect(result.data).toEqual(plotlyData);
        });

        it('picks PNG over JPEG, HTML, SVG, LaTeX, and plain text', () => {
            const bundle: MimeBundle = {
                'text/plain': 'fallback',
                'text/html': '<p>html</p>',
                'image/jpeg': 'jpegdata',
                'image/png': 'pngdata',
                'text/latex': '\\sum',
            };

            const result = translateMimeBundle(bundle);

            expect(result.type).toBe('image');
            expect(result.mimeType).toBe('image/png');
        });

        it('picks JPEG over HTML, SVG, LaTeX, and plain text', () => {
            const bundle: MimeBundle = {
                'text/plain': 'fallback',
                'text/html': '<p>html</p>',
                'image/jpeg': 'jpegdata',
                'image/svg+xml': '<svg/>',
                'text/latex': '\\sum',
            };

            const result = translateMimeBundle(bundle);

            expect(result.type).toBe('image');
            expect(result.mimeType).toBe('image/jpeg');
        });

        it('picks HTML over SVG, LaTeX, and plain text', () => {
            const bundle: MimeBundle = {
                'text/plain': 'fallback',
                'image/svg+xml': '<svg/>',
                'text/html': '<div>winner</div>',
                'text/latex': '\\sum',
            };

            const result = translateMimeBundle(bundle);

            expect(result.type).toBe('html');
            expect(result.content).toBe('<div>winner</div>');
        });

        it('picks SVG over LaTeX and plain text', () => {
            const bundle: MimeBundle = {
                'text/plain': 'fallback',
                'text/latex': '\\alpha',
                'image/svg+xml': '<svg><rect/></svg>',
            };

            const result = translateMimeBundle(bundle);

            expect(result.type).toBe('html');
            expect(result.content).toBe('<svg><rect/></svg>');
        });

        it('picks LaTeX over plain text', () => {
            const bundle: MimeBundle = {
                'text/plain': 'fallback',
                'text/latex': '\\beta',
            };

            const result = translateMimeBundle(bundle);

            expect(result.type).toBe('html');
            expect(result.content).toBe('$$\\beta$$');
        });
    });

    /* -------------------------------------------------------------- */
    /*  9. Empty bundle                                                */
    /* -------------------------------------------------------------- */

    describe('empty bundle', () => {
        it('returns empty text for an empty object', () => {
            const result = translateMimeBundle({});

            expect(result).toEqual({ type: 'text', content: '' });
        });
    });

    /* -------------------------------------------------------------- */
    /*  10. Unrecognized MIME types only                               */
    /* -------------------------------------------------------------- */

    describe('unrecognized MIME types', () => {
        it('returns empty text when bundle contains only unrecognized types', () => {
            const bundle: MimeBundle = {
                'application/octet-stream': 'binary',
                'audio/wav': 'audiodata',
                'video/mp4': 'videodata',
            };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({ type: 'text', content: '' });
        });

        it('ignores unrecognized types and picks the recognized one', () => {
            const bundle: MimeBundle = {
                'application/octet-stream': 'binary',
                'text/plain': 'recognized fallback',
            };

            const result = translateMimeBundle(bundle);

            expect(result).toEqual({ type: 'text', content: 'recognized fallback' });
        });
    });

    /* -------------------------------------------------------------- */
    /*  11. Base64 whitespace stripping                                */
    /* -------------------------------------------------------------- */

    describe('base64 whitespace stripping', () => {
        it('strips tabs and mixed whitespace from PNG base64', () => {
            const bundle: MimeBundle = {
                'image/png': 'abc\t\ndef\r\n ghi',
            };

            const result = translateMimeBundle(bundle);

            expect(result.content).toBe('data:image/png;base64,abcdefghi');
        });

        it('strips tabs and mixed whitespace from JPEG base64', () => {
            const bundle: MimeBundle = {
                'image/jpeg': 'abc\t\ndef\r\n ghi',
            };

            const result = translateMimeBundle(bundle);

            expect(result.content).toBe('data:image/jpeg;base64,abcdefghi');
        });

        it('handles base64 with no whitespace (no-op)', () => {
            const bundle: MimeBundle = {
                'image/png': 'abcdefghi',
            };

            const result = translateMimeBundle(bundle);

            expect(result.content).toBe('data:image/png;base64,abcdefghi');
        });
    });

    /* -------------------------------------------------------------- */
    /*  12. Plotly JSON as string                                      */
    /* -------------------------------------------------------------- */

    describe('plotly JSON string parsing', () => {
        it('parses a complex plotly JSON string correctly', () => {
            const plotlyObj = {
                data: [
                    { x: [1, 2, 3], y: [10, 20, 30], type: 'bar', name: 'Series A' },
                    { x: [1, 2, 3], y: [15, 25, 35], type: 'bar', name: 'Series B' },
                ],
                layout: { title: 'Grouped Bar', barmode: 'group' },
            };
            const bundle: MimeBundle = {
                'application/vnd.plotly.v1+json': JSON.stringify(plotlyObj),
            };

            const result = translateMimeBundle(bundle);

            expect(result.type).toBe('chart');
            expect(result.content).toBe('');
            expect(result.data).toEqual(plotlyObj);
        });

        it('throws on invalid JSON string for plotly', () => {
            const bundle: MimeBundle = {
                'application/vnd.plotly.v1+json': 'not valid json {{{',
            };

            expect(() => translateMimeBundle(bundle)).toThrow();
        });
    });
});
