import { cn } from '@/lib/utils';
import React from 'react';

interface CsvIconProps extends React.SVGProps<SVGSVGElement> {
  themeColorClass?: string;
  isActive?: boolean;
}

export function CsvIcon({ className, themeColorClass, isActive = true, ...props }: CsvIconProps) {
  const isMuted = !isActive;
  
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={cn(className, isMuted && "text-muted-foreground")}
      {...props}
    >
      <g transform="translate(12, 12) scale(0.8, 1.3)">
        <text
          x="0"
          y="4"
          fontSize="12"
          fontWeight="bold"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          textAnchor="middle"
          fill="currentColor"
          className={cn(!isMuted && themeColorClass)}
        >
          CSV
        </text>
      </g>
    </svg>
  );
}
