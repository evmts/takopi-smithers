// Public API exports for programmatic usage
import packageJson from '../package.json';

/**
 * The current version of takopi-smithers
 */
export const version = packageJson.version;

/**
 * Initialize takopi-smithers configuration in a repository
 * @param options - Configuration options for initialization
 */
export { init } from './commands/init';

/**
 * Start the supervisor, Takopi, and Smithers workflow
 * @param options - Configuration options for starting
 */
export { start } from './commands/start';

/**
 * Stop the supervisor and all subprocesses
 * @param options - Configuration options for stopping
 */
export { stop } from './commands/stop';

/**
 * Restart the workflow
 * @param options - Configuration options for restarting
 */
export { restart } from './commands/restart';

/**
 * Get the current workflow status
 * @param options - Configuration options for status check
 */
export { status } from './commands/status';

/**
 * Run diagnostic checks on the installation
 */
export { doctor } from './commands/doctor';

/**
 * View supervisor logs
 * @param options - Configuration options for viewing logs
 */
export { logs } from './commands/logs';

// Library exports
export { loadConfig, getTelegramCredentials } from './lib/config';
export { Supervisor } from './lib/supervisor';
export { queryWorkflowState, isHeartbeatStale } from './lib/db';
export { log } from './lib/logger';
export type { Config } from './lib/config';
