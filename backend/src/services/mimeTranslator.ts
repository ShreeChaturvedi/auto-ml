/**
 * MIME Bundle Translator
 *
 * Translates Jupyter MIME bundles into the application's RichOutput format.
 * Jupyter display_data and execute_result messages carry a MIME bundle —
 * a dictionary mapping MIME types to their representations.  We pick the
 * richest available format according to a fixed priority order:
 *
 *   application/vnd.plotly.v1+json  (interactive chart)
 *   image/png                       (raster image, base64)
 *   image/jpeg                      (raster image, base64)
 *   text/html                       (styled DataFrames, Plotly HTML, etc.)
 *   image/svg+xml                   (vector graphic)
 *   text/latex                      (math expressions)
 *   text/plain                      (fallback)
 */

import type { RichOutput } from '../types/execution.js';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface MimeBundle {
    [mimeType: string]: string | object;
}

/* ------------------------------------------------------------------ */
/*  Priority table                                                    */
/* ------------------------------------------------------------------ */

interface MimeRule {
    mime: string;
    convert: (value: string | object) => RichOutput;
}

const MIME_PRIORITY: MimeRule[] = [
    // Plotly JSON — render as interactive chart
    {
        mime: 'application/vnd.plotly.v1+json',
        convert(value) {
            const data = typeof value === 'string' ? JSON.parse(value) : value;
            return { type: 'chart', content: '', data };
        },
    },

    // Raster images — Jupyter sends as base64-encoded strings
    ...(['image/png', 'image/jpeg'] as const).map((mime) => ({
        mime,
        convert(value: string | object): RichOutput {
            const b64 = typeof value === 'string' ? value.replace(/\s+/g, '') : String(value);
            return { type: 'image' as const, content: `data:${mime};base64,${b64}`, mimeType: mime };
        },
    })),

    // HTML — styled DataFrames, Plotly HTML fallback, widgets, etc.
    {
        mime: 'text/html',
        convert(value) {
            return { type: 'html', content: String(value) };
        },
    },

    // SVG — inline vector graphic; render as HTML
    {
        mime: 'image/svg+xml',
        convert(value) {
            return { type: 'html', content: String(value) };
        },
    },

    // LaTeX — wrap in display-math delimiters so the frontend can render it
    {
        mime: 'text/latex',
        convert(value) {
            return { type: 'html', content: `$$${String(value)}$$` };
        },
    },

    // Plain text — ultimate fallback
    {
        mime: 'text/plain',
        convert(value) {
            return { type: 'text', content: String(value) };
        },
    },
];

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Pick the richest representation from a Jupyter MIME bundle and return
 * the corresponding {@link RichOutput}.  Returns an empty text output
 * when the bundle contains no recognised MIME types.
 */
export function translateMimeBundle(bundle: MimeBundle): RichOutput {
    for (const rule of MIME_PRIORITY) {
        const value = bundle[rule.mime];
        if (value !== undefined && value !== null) {
            return rule.convert(value);
        }
    }

    // Nothing recognised — return empty text
    return { type: 'text', content: '' };
}
