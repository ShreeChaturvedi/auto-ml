/**
 * ThinkingBlock - Display LLM thinking/reasoning content
 *
 * Features:
 * - Shows elapsed time while thinking, final time when done
 * - Metallic shimmer animation while thinking (always, not just on hover)
 * - No chevron - click anywhere on row to toggle expanded content
 * - Markdown + LaTeX rendering for thinking content
 */

import { useState, useEffect, useRef } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import 'katex/dist/katex.min.css';

interface ThinkingBlockProps {
    content: string;
    isComplete: boolean;
    messageId?: string;
    isLive?: boolean;
    animateOnMount?: boolean;
}

export function ThinkingBlock({
    content,
    isComplete,
    messageId,
    isLive,
    animateOnMount = true
}: ThinkingBlockProps) {
    const [expanded, setExpanded] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [finalSeconds, setFinalSeconds] = useState<number | null>(null);
    const startTimeRef = useRef<number>(Date.now());
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const stableMessageIdRef = useRef<string>(messageId ?? `thinking-${Math.random().toString(36).slice(2, 10)}`);
    const effectiveMessageId = messageId ?? stableMessageIdRef.current;

    // Start timer on mount, stop when isComplete changes to true
    useEffect(() => {
        // Component just mounted - start the timer
        startTimeRef.current = Date.now();
        setElapsedSeconds(0);
        setFinalSeconds(null);

        intervalRef.current = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, []); // Only run on mount

    // Separate effect to handle completion
    useEffect(() => {
        if (isComplete && intervalRef.current) {
            // Stop the timer and capture final time
            clearInterval(intervalRef.current);
            intervalRef.current = null;

            // Calculate final elapsed time directly
            const finalTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
            setFinalSeconds(finalTime);
            setElapsedSeconds(finalTime);
        }
    }, [isComplete]);

    const displaySeconds = finalSeconds ?? elapsedSeconds;

    const isLoading = !isComplete;
    const shouldStreamReveal = isLive ?? !isComplete;
    const markdownClassName = [
        'text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words',
        '[&_p]:my-0 [&_p+p]:mt-2',
        '[&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5',
        '[&_h1]:my-2 [&_h1]:text-sm [&_h1]:font-semibold',
        '[&_h2]:my-2 [&_h2]:text-sm [&_h2]:font-semibold',
        '[&_h3]:my-1.5 [&_h3]:text-sm [&_h3]:font-semibold',
        '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2.5',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em]',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0'
    ].join(' ');

    const renderMarkdown = (markdownText: string) => (
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
        >
            {markdownText}
        </ReactMarkdown>
    );

    return (
        <div className="flex flex-col">
            <button
                type="button"
                onClick={() => content && setExpanded(!expanded)}
                disabled={!content}
                className={cn(
                    'flex items-center gap-2 text-sm transition-all',
                    'py-1.5 px-2.5 rounded-md w-fit text-left',
                    content && 'hover:bg-muted/50 cursor-pointer',
                    !content && 'cursor-default',
                    'text-muted-foreground'
                )}
            >
                {/* Brain icon or spinner when loading */}
                {isLoading ? (
                    <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-muted-foreground" />
                ) : (
                    <Brain className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                )}

                {/* Label with shimmer effect when loading */}
                <span className={cn(isLoading && 'shimmer-text')}>
                    {isComplete ? `Thought for ${displaySeconds}s` : `Thinking for ${displaySeconds}s`}
                </span>
            </button>

            {/* Expandable content - now with markdown rendering */}
            {expanded && content && (
                <div className="ml-6 mt-1 max-h-[300px] overflow-y-auto rounded-md border border-muted/50 bg-muted/30 p-3">
                    <ProgressiveMessageText
                        messageId={effectiveMessageId}
                        text={content}
                        isLive={shouldStreamReveal}
                        animateOnMount={animateOnMount}
                        plainClassName={markdownClassName}
                        finalClassName={markdownClassName}
                        renderProgressive={renderMarkdown}
                        renderFinal={renderMarkdown}
                    />
                </div>
            )}
        </div>
    );
}
