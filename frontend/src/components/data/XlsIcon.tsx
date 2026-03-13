import { FileTypeBadgeIcon } from './CsvIcon';
import type React from 'react';

export interface XlsIconProps extends React.SVGProps<SVGSVGElement> {
  themeColorClass?: string;
  isActive?: boolean;
}

export function XlsIcon(props: XlsIconProps) {
  return <FileTypeBadgeIcon label="XLS" {...props} />;
}
