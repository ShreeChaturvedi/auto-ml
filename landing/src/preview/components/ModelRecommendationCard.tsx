/**
 * ModelRecommendationCard — Landing-only from-scratch recommendation
 * summary. Built from scratch (per landing design spec §5.5) because
 * the real `frontend/src/components/training/ModelRecommendationCard`
 * depends on template metadata and Shadcn Card primitives that pull
 * in considerable Radix weight. This lightweight version mimics its
 * visual language — header, headline metric, secondary metrics,
 * expandable "why?" rationale, and a no-op Deploy button.
 */

import { useState } from 'react';
import { ChevronRight, Rocket, Trophy } from 'lucide-react';

import styles from '@/preview/tabs/TrainingView.module.css';
import type { ModelRecommendation } from '@/preview/fixtures/training';

interface Props {
  recommendation: ModelRecommendation;
}

export function ModelRecommendationCard({ recommendation }: Props) {
  // Default collapsed so the card reads as "one primary metric +
  // expandable rationale" — matches the spec's "why? expandable"
  // constraint without wasting vertical space.
  const [whyOpen, setWhyOpen] = useState(false);

  const { modelName, finalMetricLabel, finalMetricValue, secondaryMetrics, reasons } = recommendation;

  return (
    <section className={styles.recCard} aria-label="Chosen model recommendation">
      <div className={styles.recHeader}>
        <div>
          <div className={styles.recEyebrow}>CHAMPION</div>
          <h3 className={styles.recTitle}>
            <Trophy className={styles.recTrophy} aria-hidden="true" />
            {modelName}
          </h3>
        </div>

        <div className={styles.recMetricBlock}>
          <span className={styles.recMetricValue}>{finalMetricValue}</span>
          <span className={styles.recMetricLabel}>{finalMetricLabel}</span>
        </div>
      </div>

      <div className={styles.recSecondary} role="list">
        {secondaryMetrics.map((m) => (
          <span key={m.label} role="listitem" className={styles.secChip}>
            {m.label} <strong>{m.value}</strong>
          </span>
        ))}
      </div>

      <button
        type="button"
        className={styles.whyToggle}
        aria-expanded={whyOpen}
        aria-controls="model-rec-why"
        onClick={() => setWhyOpen((v) => !v)}
      >
        <ChevronRight
          className={
            whyOpen
              ? `${styles.whyChevron} ${styles.whyChevronOpen}`
              : styles.whyChevron
          }
          aria-hidden="true"
        />
        {whyOpen ? 'hide rationale' : 'why this model?'}
      </button>

      {whyOpen && (
        <ul id="model-rec-why" className={styles.whyList}>
          {reasons.map((reason, i) => (
            <li key={i}>
              <span className={styles.whyBullet} aria-hidden="true" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.deployRow}>
        <span className={styles.deployHint}>Ready to ship · CPU inference</span>
        <button
          type="button"
          className={styles.deployButton}
          onClick={(e) => e.preventDefault()}
          aria-label="Deploy XGBoost champion (demo — no action)"
        >
          <Rocket aria-hidden="true" />
          Deploy model
        </button>
      </div>
    </section>
  );
}
