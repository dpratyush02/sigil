/**
 * SIGIL — useNetwork hook
 * Provides real-time online/offline state with no native dependency.
 */

import { useEffect, useState } from 'react';
import { addNetworkListener, getNetworkState, startNetworkMonitor } from '../utils/offlineQueue';

export function useNetwork() {
  const [isOnline, setIsOnline] = useState(getNetworkState());

  useEffect(() => {
    startNetworkMonitor();
    const unsub = addNetworkListener(setIsOnline);
    return unsub;
  }, []);

  return { isOnline };
}
