import { cn } from '@/lib/utils';
import React from 'react';

interface XlsIconProps extends React.SVGProps<SVGSVGElement> {
  themeColorClass?: string;
  isActive?: boolean;
}

export function XlsIcon({ className, themeColorClass, isActive = true, ...props }: XlsIconProps) {
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
          style={{
            transform: 'scale(0.8, 1.25)',
            transformOrigin: 'center'
          }}
        >
          XLS
        </text>
    </svg>
  );
}