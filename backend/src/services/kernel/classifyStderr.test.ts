import { describe, expect, it } from 'vitest';

import { cleanKernelPaths, isStderrWarning } from './execution.js';

// ---------------------------------------------------------------------------
// cleanKernelPaths
// ---------------------------------------------------------------------------

describe('cleanKernelPaths', () => {
    it('strips /workspace/.tmp/ipykernel_* paths', () => {
        const input = '/workspace/.tmp/ipykernel_122/1071595705.py:36: FutureWarning: deprecated';
        expect(cleanKernelPaths(input)).toBe('<cell>:36: FutureWarning: deprecated');
    });

    it('strips /tmp/ipykernel_* paths', () => {
        const input = '/tmp/ipykernel_789/012345.py:42: UserWarning: something';
        expect(cleanKernelPaths(input)).toBe('<cell>:42: UserWarning: something');
    });

    it('strips multiple kernel paths in one chunk', () => {
        const input = [
            '/workspace/.tmp/ipykernel_1/111.py:1: FutureWarning: a',
            '/workspace/.tmp/ipykernel_2/222.py:2: FutureWarning: b',
        ].join('\n');
        expect(cleanKernelPaths(input)).toBe(
            '<cell>:1: FutureWarning: a\n<cell>:2: FutureWarning: b'
        );
    });

    it('leaves non-kernel paths unchanged', () => {
        const input = '/usr/lib/python3.11/site-packages/pandas/core/frame.py:123: FutureWarning: deprecated';
        expect(cleanKernelPaths(input)).toBe(input);
    });

    it('leaves text without paths unchanged', () => {
        expect(cleanKernelPaths('just some text')).toBe('just some text');
    });
});

// ---------------------------------------------------------------------------
// isStderrWarning
// ---------------------------------------------------------------------------

describe('isStderrWarning', () => {
    const warningCategories = [
        'FutureWarning',
        'DeprecationWarning',
        'PendingDeprecationWarning',
        'UserWarning',
        'RuntimeWarning',
        'SyntaxWarning',
        'ResourceWarning',
        'ImportWarning',
        'UnicodeWarning',
        'BytesWarning',
    ];

    for (const category of warningCategories) {
        it(`detects ${category}`, () => {
            const text = `/usr/lib/python3.11/foo.py:10: ${category}: some message\n  code_line()`;
            expect(isStderrWarning(text)).toBe(true);
        });
    }

    it('detects custom Warning subclasses ending in "Warning"', () => {
        // e.g. sklearn's ConvergenceWarning
        const text = '/usr/lib/python3.11/sklearn/linear_model.py:99: ConvergenceWarning: Solver did not converge.';
        expect(isStderrWarning(text)).toBe(true);
    });

    it('detects warnings with kernel paths already cleaned', () => {
        const text = '<cell>:36: FutureWarning: deprecated call';
        expect(isStderrWarning(text)).toBe(true);
    });

    it('detects multiline warning text', () => {
        const text = [
            '/workspace/foo.py:5: FutureWarning: ',
            '',
            'Passing `palette` without assigning `hue` is deprecated.',
            '',
            '  sns.boxplot(x="approved", y="loan_amount")',
        ].join('\n');
        expect(isStderrWarning(text)).toBe(true);
    });

    it('rejects plain stderr text', () => {
        expect(isStderrWarning('err\n')).toBe(false);
    });

    it('rejects arbitrary debug output', () => {
        expect(isStderrWarning('debug: some info printed to stderr')).toBe(false);
    });

    it('rejects Python tracebacks', () => {
        const text = [
            'Traceback (most recent call last):',
            '  File "main.py", line 1, in <module>',
            '    1/0',
            'ZeroDivisionError: division by zero',
        ].join('\n');
        expect(isStderrWarning(text)).toBe(false);
    });

    it('rejects empty string', () => {
        expect(isStderrWarning('')).toBe(false);
    });

    it('handles ANSI-wrapped warning text', () => {
        // Some environments emit ANSI color codes around warnings
        const text = '\x1b[33m/usr/lib/python3.11/foo.py:10: FutureWarning: deprecated\x1b[0m';
        expect(isStderrWarning(text)).toBe(true);
    });
});
