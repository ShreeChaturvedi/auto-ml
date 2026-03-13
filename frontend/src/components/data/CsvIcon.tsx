import { cn } from '@/lib/utils';
import React from 'react';

interface FileTypeBadgeIconProps extends React.SVGProps<SVGSVGElement> {
  label: string;
  themeColorClass?: string;
  isActive?: boolean;
}

/**
 * Renders a compact text label (e.g. "CSV", "XLS") as an SVG icon badge.
 * Used as the icon for file types that don't have a standard Lucide icon.
 */
export function FileTypeBadgeIcon({ label, className, themeColorClass, isActive = true, ...props }: FileTypeBadgeIconProps) {
  const isMuted = !isActive;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={cn(className, isMuted && "text-muted-foreground")}
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
        className={cn(!isMuted && themeColorClass)}
        transform="scale(0.8, 1.25)"
        transform-origin="12 12"
      >
        {label}
      </text>
    </svg>
  );
}

export interface CsvIconProps extends React.SVGProps<SVGSVGElement> {
  themeColorClass?: string;
  isActive?: boolean;
}

export function CsvIcon(props: CsvIconProps) {
  return <FileTypeBadgeIcon label="CSV" {...props} />;
}
