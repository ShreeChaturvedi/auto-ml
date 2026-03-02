import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ChartPie, TableIcon } from 'lucide-react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { IconModeToggle } from '../IconModeToggle';

function ToggleHarness() {
  const [value, setValue] = useState('table');

  return (
    <TooltipProvider>
      <IconModeToggle
        value={value}
        onValueChange={setValue}
        options={[
          { value: 'table', ariaLabel: 'Table view', icon: TableIcon, tooltip: 'Table' },
          { value: 'eda', ariaLabel: 'Analysis view', icon: ChartPie, tooltip: 'Analysis' }
        ]}
      />
    </TooltipProvider>
  );
}

describe('IconModeToggle', () => {
  it('preserves toggle state for tooltip-wrapped items', async () => {
    const user = userEvent.setup();
    render(<ToggleHarness />);

    const tableButton = screen.getByRole('radio', { name: /table view/i });
    const analysisButton = screen.getByRole('radio', { name: /analysis view/i });

    expect(tableButton).toHaveAttribute('data-state', 'on');
    expect(analysisButton).toHaveAttribute('data-state', 'off');

    await user.click(analysisButton);

    expect(analysisButton).toHaveAttribute('data-state', 'on');
    expect(tableButton).toHaveAttribute('data-state', 'off');
  });
});
