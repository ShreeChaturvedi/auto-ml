import type { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { getHealthReport, type HealthReport } from '../services/healthService.js';

export function registerHealthRoutes(
  router: Router,
  healthReportFactory: () => Promise<HealthReport> = getHealthReport
) {
  router.get('/health', asyncHandler(async (_req, res) => {
    const report = await healthReportFactory();
    res.status(report.status === 'error' ? 503 : 200).json(report);
  }));
}
