/**
 * SIGIL — useScanner hook
 *
 * Features:
 * - Prevents overlapping scans (in-process mutex flag)
 * - Scan health indicator (last scan time, success state)
 * - updateAlert for mark-reviewed / archive actions
 * - getAlertById
 */

import { useState, useCallback, useRef } from 'react';
import {
  getAlerts,
  runFullScan,
  getScanHealth,
  updateAlert,
  SigilAlert,
  ScanHealth,
} from '../services/scanner';
import { getStoredContent } from './useBlockchain';
import { Logger } from '../utils/logger';

export function useScanner() {
  const [alerts, setAlerts] = useState<SigilAlert[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [health, setHealth] = useState<ScanHealth | null>(null);
  const scanningRef = useRef(false); // in-process guard

  const loadAlerts = useCallback(async () => {
    const stored = await getAlerts();
    setAlerts(stored);
    setHasScanned(true);
    const h = await getScanHealth();
    setHealth(h);
  }, []);

  const runScan = useCallback(async () => {
    // Prevent double-trigger from UI
    if (scanningRef.current) {
      Logger.warn('scanner', 'runScan: already scanning, ignoring trigger');
      return;
    }
    scanningRef.current = true;
    setIsScanning(true);

    try {
      const content = await getStoredContent();
      if (content.length === 0) {
        setAlerts([]);
        setHasScanned(true);
        return;
      }

      const newAlerts = await runFullScan(
        content.map((c) => ({
          contentHash: c.contentHash,
          contentName: c.contentName,
          contentType: c.contentType as any,
          watermarkPattern: c.watermarkPattern,
          rawContent: undefined,
        }))
      );

      // Reload from storage (includes persisted ones) after scan
      const allAlerts = await getAlerts();
      setAlerts(allAlerts);

      const h = await getScanHealth();
      setHealth(h);
    } finally {
      scanningRef.current = false;
      setIsScanning(false);
      setHasScanned(true);
    }
  }, []);

  const markReviewed = useCallback(async (id: string) => {
    await updateAlert(id, { reviewed: true });
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, reviewed: true } : a)));
  }, []);

  const archiveAlert = useCallback(async (id: string) => {
    await updateAlert(id, { archived: true });
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, archived: true } : a)));
  }, []);

  const getAlertById = useCallback(
    (id: string) => alerts.find((a) => a.id === id) ?? null,
    [alerts]
  );

  /** Unreviewed + not archived alerts */
  const unreadCount = alerts.filter((a) => !a.reviewed && !a.archived).length;

  return {
    alerts,
    isScanning,
    hasScanned,
    health,
    unreadCount,
    loadAlerts,
    runScan,
    markReviewed,
    archiveAlert,
    getAlertById,
  };
}
