import { cn } from '@/lib/utils';
import type React from 'react';

interface FileTypeBadgeIconProps extends React.SVGProps<SVGSVGElement> {
  label: string;
}

/**
 * Renders a compact text label (e.g. "CSV", "XLS", "PDF") as an SVG icon badge.
 * Color is controlled via className on the parent — e.g. `className="text-green-500"`.
 */
export function FileTypeBadgeIcon({ label, className, ...props }: FileTypeBadgeIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <text
        x="12"
        y="12"
        fontSize="15"
        fontWeight="bold"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        transform="scale(0.8, 1.25)"
        transform-origin="12 12"
      >
        {label}
      </text>
    </svg>
  );
}

export function CsvIcon(props: React.SVGProps<SVGSVGElement>) {
  return <FileTypeBadgeIcon label="CSV" {...props} />;
}

export function XlsIcon(props: React.SVGProps<SVGSVGElement>) {
  return <FileTypeBadgeIcon label="XLS" {...props} />;
}

export function PdfIcon(props: React.SVGProps<SVGSVGElement>) {
  return <FileTypeBadgeIcon label="PDF" {...props} />;
}

export function DocIcon(props: React.SVGProps<SVGSVGElement>) {
  return <FileTypeBadgeIcon label="DOC" {...props} />;
}

export function JsnIcon(props: React.SVGProps<SVGSVGElement>) {
  return <FileTypeBadgeIcon label="JSN" {...props} />;
}

export function TxtIcon(props: React.SVGProps<SVGSVGElement>) {
  return <FileTypeBadgeIcon label="TXT" {...props} />;
}

/** Standard markdown mark: rounded rectangle containing "M" glyph and down-arrow. */
export function MarkdownIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('fill-none', className)}
      {...props}
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M5.5 15.5V8.5l3.5 4 3.5-4v7" />
      <path d="M18.5 8.5v7m-2.5-3 2.5 2.5 2.5-2.5" />
    </svg>
  );
}
