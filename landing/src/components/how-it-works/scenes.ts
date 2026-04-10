// Seven phase scenes for the pinned scrollytelling section.
// Headline formula: mixed-color (line1 white / line2 muted), Linear cadence.

export interface PhaseScene {
  code: string;      // e.g. '1.0 INGEST'
  index: number;     // 1..7
  total: number;     // 7
  headlineBright: string;
  headlineMuted: string;
  dioramaId:
    | 'ingest'
    | 'explore'
    | 'preprocess'
    | 'engineer'
    | 'train'
    | 'experiments'
    | 'deploy';
}

export const PHASE_SCENES: PhaseScene[] = [
  {
    code: '1.0 INGEST',
    index: 1, total: 7,
    headlineBright: 'Upload your data.',
    headlineMuted:  'Let the agent plan the work.',
    dioramaId: 'ingest',
  },
  {
    code: '2.0 EXPLORE',
    index: 2, total: 7,
    headlineBright: 'Ask in English.',
    headlineMuted:  'Get SQL, answers, and charts.',
    dioramaId: 'explore',
  },
  {
    code: '3.0 PREPROCESS',
    index: 3, total: 7,
    headlineBright: 'Fix your data without',
    headlineMuted:  'writing the code.',
    dioramaId: 'preprocess',
  },
  {
    code: '4.0 ENGINEER',
    index: 4, total: 7,
    headlineBright: 'Derive features automatically.',
    headlineMuted:  'Keep the ones that matter.',
    dioramaId: 'engineer',
  },
  {
    code: '5.0 TRAIN',
    index: 5, total: 7,
    headlineBright: 'Train models in parallel.',
    headlineMuted:  'The champion is chosen for you.',
    dioramaId: 'train',
  },
  {
    code: '6.0 EXPERIMENTS',
    index: 6, total: 7,
    headlineBright: 'Every run, ranked and explained.',
    headlineMuted:  'Understand why a model wins.',
    dioramaId: 'experiments',
  },
  {
    code: '7.0 DEPLOY',
    index: 7, total: 7,
    headlineBright: 'Ship to an endpoint in one click.',
    headlineMuted:  'Monitor it in real time.',
    dioramaId: 'deploy',
  },
];
