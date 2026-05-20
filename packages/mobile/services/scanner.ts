/**
 * SIGIL — scanner.ts backward-compat re-export
 * All actual implementation lives in services/scanner/
 */

export {
  SigilAlert,
  AlertSource,
  ContentType,
  getAlerts,
  saveAlert,
  updateAlert,
  clearAlerts,
  BACKGROUND_SCAN_TASK,
  runFullScan,
  getScanHealth,
  ScanHealth,
  getQueue,
  queueScan,
  getUnnotifiedAlerts,
  wasNotified,
  markNotified,
} from './scanner/index';

export type { ScanItem } from './scanner/index';
