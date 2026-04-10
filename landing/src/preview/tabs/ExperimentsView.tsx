import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePreviewStore } from '@/preview/previewStore';
import { mockModels, type ModelFixture } from '@/preview/fixtures/experiments';
import styles from './ExperimentsView.module.css';

const SORTED_MODELS: ModelFixture[] = [...mockModels].sort((a, b) => b.f1 - a.f1);

export function ExperimentsView() {
  const selectedId = usePreviewStore((s) => s.experiments.selectedModelId);
  const selectModel = usePreviewStore((s) => s.selectExperimentModel);

  const activeModel: ModelFixture =
    SORTED_MODELS.find((m) => m.id === selectedId) ?? SORTED_MODELS[0];

  return (
    <div className={styles.root}>
      <section className={styles.leaderboard}>
        <p className={styles.leaderboardTitle}>4 MODELS · SORTED BY F1</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>model</th>
              <th>F1</th>
              <th>precision</th>
              <th>recall</th>
              <th>AUC</th>
              <th>train time</th>
            </tr>
          </thead>
          <tbody>
            {SORTED_MODELS.map((m, i) => (
              <tr
                key={m.id}
                className={cn(m.id === activeModel.id && styles.selected)}
                onClick={() => selectModel(m.id)}
              >
                <td className={styles.rankCell}>{i + 1}</td>
                <td>
                  {m.name}
                  {m.isChampion && <Star size={12} fill="currentColor" className={styles.champion} aria-label="champion" />}
                </td>
                <td>{m.f1.toFixed(4)}</td>
                <td>{m.precision.toFixed(4)}</td>
                <td>{m.recall.toFixed(4)}</td>
                <td>{m.auc.toFixed(4)}</td>
                <td>{m.trainingSeconds}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <aside className={styles.detail}>
        <h3 className={styles.detailTitle}>{activeModel.name}</h3>
        <p className={styles.detailSubtitle}>{activeModel.family} · trained {new Date(activeModel.trainedAt).toLocaleTimeString()}</p>

        <div className={styles.metricsGrid}>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>F1</div>
            <div className={styles.metricValue}>{activeModel.f1.toFixed(3)}</div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>AUC</div>
            <div className={styles.metricValue}>{activeModel.auc.toFixed(3)}</div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>Precision</div>
            <div className={styles.metricValue}>{activeModel.precision.toFixed(3)}</div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>Recall</div>
            <div className={styles.metricValue}>{activeModel.recall.toFixed(3)}</div>
          </div>
        </div>

        <p className={styles.leaderboardTitle}>TOP FEATURES</p>
        {activeModel.topFeatures.map((f) => (
          <div key={f.name} className={styles.featureBar}>
            <span className={styles.featureBarName}>{f.name}</span>
            <span className={styles.featureBarTrack}>
              <span className={styles.featureBarFill} style={{ width: `${f.importance * 100}%` }} />
            </span>
            <span className={styles.featureBarValue}>{f.importance.toFixed(2)}</span>
          </div>
        ))}
      </aside>
    </div>
  );
}
