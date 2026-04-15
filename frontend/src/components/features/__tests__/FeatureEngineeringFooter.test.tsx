import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ReadinessReport } from '@/types/feature';

import { FeatureEngineeringFooter } from '../FeatureEngineeringFooter';

const emptyReport: ReadinessReport = {
  dataSummary: {
    addedColumns: [],
    removedColumns: [],
    renamedColumns: [],
    typeChanges: [],
    nullDeltas: [],
    warnings: []
  },
  steps: []
};

function renderFooter(overrides: Partial<ComponentProps<typeof FeatureEngineeringFooter>> = {}) {
  return render(
    <FeatureEngineeringFooter
      readinessReportUnlocked={false}
      isReadinessExpanded={false}
      onToggleReadiness={vi.fn()}
      readinessReport={emptyReport}
      outputName=""
      onOutputNameChange={vi.fn()}
      outputFormat="csv"
      onOutputFormatChange={vi.fn()}
      onApplyFeatures={vi.fn()}
      applyStatus="idle"
      applyMessage={null}
      activeFeaturesCount={1}
      {...overrides}
    />
  );
}

describe('FeatureEngineeringFooter', () => {
  it('renders feature apply schema errors as an expanded error card', () => {
    renderFooter({
      applyStatus: 'error',
      applyMessage: 'Feature engineering produced no new columns in feature_v1.csv. Applied 3 feature(s) but the output schema matches the source exactly.'
    });

    expect(screen.getByText('No new feature columns were created')).toBeInTheDocument();
    expect(screen.getByText(/The selected features already exist or did not change the schema/i)).toBeInTheDocument();
    expect(screen.getByText(/Feature engineering produced no new columns in feature_v1.csv/i)).toBeInTheDocument();
  });

  it('renders successful apply feedback as a compact success card', () => {
    renderFooter({
      applyStatus: 'success',
      applyMessage: 'Created feature_v2.csv'
    });

    expect(screen.getByText('Feature pipeline applied')).toBeInTheDocument();
    expect(screen.getByText('Created feature_v2.csv')).toBeInTheDocument();
  });
});
