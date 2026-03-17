import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';

import { defaultGetClient, runGeneratePipeline } from './pipeline.js';
import { runRepairPipeline } from './repair.js';
import type {
  GenerateSqlV2Options,
  GeneratedSqlV2,
  RepairSqlV2Options
} from './types.js';

export type {
  GenerateSqlV2Options,
  GeneratedSqlV2,
  NlConfidenceMode,
  NlExplanation,
  NlJoinPlan,
  NlModelWorkBlockCompletedEvent,
  NlModelWorkBlockStartedEvent,
  NlModelWorkDeltaEvent,
  NlModelWorkEvent,
  NlModelWorkKind,
  NlProgressEvent,
  NlProgressPhaseId,
  NlProgressStatus,
  NlProviderInfo,
  NlReliabilityTier,
  RepairSqlV2Options,
  WarningLevel
} from './types.js';

export { createNl2SqlService };

function createNl2SqlService(overrides: {
  datasetRepository?: import('../../repositories/datasetRepository.js').DatasetRepository;
  getClient?: (model: string) => import('../llm/llmClient.js').LlmClient;
} = {}) {
  const datasetRepository = overrides.datasetRepository ?? createDatasetRepository(env.datasetMetadataPath);
  const getClient = overrides.getClient ?? defaultGetClient;

  return {
    generateSqlFromNaturalLanguageV2(options: GenerateSqlV2Options): Promise<GeneratedSqlV2> {
      return runGeneratePipeline(options, { datasetRepository, getClient });
    },
    repairSqlFromExecutionErrorV2(options: RepairSqlV2Options): Promise<GeneratedSqlV2> {
      return runRepairPipeline(options, { datasetRepository, getClient });
    }
  };
}

const defaultNl2SqlService = createNl2SqlService();

export async function generateSqlFromNaturalLanguageV2(
  options: GenerateSqlV2Options
): Promise<GeneratedSqlV2> {
  return defaultNl2SqlService.generateSqlFromNaturalLanguageV2(options);
}

export async function repairSqlFromExecutionErrorV2(
  options: RepairSqlV2Options
): Promise<GeneratedSqlV2> {
  return defaultNl2SqlService.repairSqlFromExecutionErrorV2(options);
}
