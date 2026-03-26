import { exec } from 'child_process';
import { promisify } from 'util';

import { appLogger } from '../../logging/logger.js';

const execAsync = promisify(exec);
const NETWORK_NAME = 'automl-sandbox';
let networkEnsured = false;

/**
 * Ensure the isolated Docker network exists. Uses the `--internal` flag to
 * prevent outbound internet access and SSRF to the host network.
 * Falls back to `bridge` if creation fails (e.g. Docker not available).
 */
export async function ensureIsolatedNetwork(): Promise<string> {
  if (networkEnsured) return NETWORK_NAME;
  try {
    await execAsync(`docker network inspect ${NETWORK_NAME}`);
    networkEnsured = true;
    return NETWORK_NAME;
  } catch {
    // Network doesn't exist — create it
    try {
      await execAsync(`docker network create --internal ${NETWORK_NAME}`);
      appLogger.info(`[container] Created isolated network: ${NETWORK_NAME}`);
      networkEnsured = true;
      return NETWORK_NAME;
    } catch (err) {
      appLogger.warn({ err }, '[container] Failed to create isolated network, falling back to bridge');
      return 'bridge';
    }
  }
}
