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
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(className, isMuted && "text-muted-foreground")}
      {...props}
    >
      {/* File Outline - Theme Color */}
      <path 
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" 
        className={cn(!isMuted && themeColorClass)}
      />
      <polyline 
        points="14 2 14 8 20 8" 
        className={cn(!isMuted && themeColorClass)}
      />
      
      {/* Spreadsheet Grid - Green */}
      <line x1="8" y1="13" x2="16" y2="13" className={cn(!isMuted && "text-emerald-500")} />
      <line x1="8" y1="17" x2="16" y2="17" className={cn(!isMuted && "text-emerald-500")} />
      <line x1="12" y1="13" x2="12" y2="21" className={cn(!isMuted && "text-emerald-500")} />
    </svg>
  );
}
