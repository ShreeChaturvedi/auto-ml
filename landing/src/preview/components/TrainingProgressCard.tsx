/**
 * TrainingProgressCard — Landing-only from-scratch training leaderboard.
 *
 * Built from scratch (per landing design spec §5.5) because the real
 * `frontend/src/components/training/TrainingProgressCard` is tightly
 * coupled to `useProjectThemeColor`, live execution state, and the
 * training run store — none of which exist in the landing preview.
 *
 * Visual mimic of the real card: 4 stacked model rows, each with a
 * Recharts loss-curve sparkline, a current metric, and a pulsing star
 * on the winner. Header shows elapsed time, GPU util, trials counter,
 * and a status chip. All data flows from the
 * `trainingProgressSnapshot` fixture.
 */

import { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Activity, Cpu, Star, Timer } from 'lucide-react';

import styles from '@/preview/tabs/TrainingView.module.css';
import type { TrainingProgressSnapshot, TrainingModelRow } from '@/preview/fixtures/training';

interface Props {
  snapshot: TrainingProgressSnapshot;
}

function Sparkline({ row }: { row: TrainingModelRow }) {
  // Recharts consumes `{ i, v }` objects. Memoised so the chart never
  // re-renders on unrelated parent state changes (e.g. `why?` toggle).
  const data = useMemo(
    () => row.lossCurve.map((v, i) => ({ i, v })),
    [row.lossCurve],
  );

  // Winner gets an accent violet stroke to telegraph "this is the
  // champion"; the others use a neutral muted stroke so the sparklines
  // stay visually quiet alongside the dominant winner.
  const stroke = row.winner ? 'hsl(262 83% 68%)' : 'hsl(0 0% 55%)';

  return (
    <div className={styles.sparkline} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrainingProgressCard({ snapshot }: Props) {
  const { status, elapsedLabel, gpuUtilPercent, trialsCompleted, trialsTotal, models } = snapshot;

  return (
    <section className={styles.progressCard} aria-label="Training progress">
      <header className={styles.progressHeader}>
        <div>
          <h3 className={styles.progressTitle}>Training run · 5-fold CV</h3>
          <div className={styles.progressSubtitle}>
            {trialsCompleted}/{trialsTotal} Optuna trials · Optuna TPE sampler
          </div>
        </div>

        <div className={styles.progressMeta}>
          <span className={styles.metaItem}>
            <Timer className={styles.metaIcon} aria-hidden="true" />
            <span>{elapsedLabel}</span>
          </span>
          <span className={styles.metaItem}>
            <Cpu className={styles.metaIcon} aria-hidden="true" />
            <span>GPU {gpuUtilPercent}%</span>
          </span>
          <span className={styles.statusChip} aria-label={`status: ${status}`}>
            <span className={styles.statusChipDot} aria-hidden="true" />
            {status}
          </span>
        </div>
      </header>

      <div role="list">
        {models.map((row) => (
          <div
            role="listitem"
            key={row.id}
            className={
              row.winner
                ? `${styles.modelRow} ${styles.modelRowWinner}`
                : styles.modelRow
            }
          >
            <div className={styles.modelName}>
              {row.winner && (
                <Star
                  className={styles.winnerStar}
                  fill="currentColor"
                  aria-label="Current leader"
                />
              )}
              <span>{row.name}</span>
            </div>

            <Sparkline row={row} />

            <div className={styles.modelMetric}>
              <span className={styles.modelMetricLabel}>{row.metricLabel}</span>
              {row.metricValue}
            </div>
          </div>
        ))}
      </div>

      {/* Visually-hidden summary for screen readers — avoids an accessible-name
          void on the live sparklines above. */}
      <span className="sr-only">
        <Activity aria-hidden="true" />
        {` Champion: ${models.find((m) => m.winner)?.name ?? 'none'} with `}
        {models.find((m) => m.winner)?.metricValue ?? 'no score'}
      </span>
    </section>
  );
}
