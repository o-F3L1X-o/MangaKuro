import { useEffect, useCallback, useRef } from 'react';
import { sanitizeClientStorage, scheduleIdleSanitation, StorageSanitationReport } from '../utils/storageSanitizer';

interface UseStorageSanitizerOptions {
  validSessionIds?: string[];
  autoCleanOnUnload?: boolean;
}

export function useStorageSanitizer(options: UseStorageSanitizerOptions = {}) {
  const { validSessionIds, autoCleanOnUnload = true } = options;
  const validIdsRef = useRef<string[] | undefined>(validSessionIds);

  useEffect(() => {
    validIdsRef.current = validSessionIds;
  }, [validSessionIds]);

  // Run idle sanitation when validSessionIds change or on initial mount
  useEffect(() => {
    scheduleIdleSanitation(validIdsRef.current);
  }, [validSessionIds?.length]);

  // Hook into browser pagehide and beforeunload events safely
  useEffect(() => {
    if (!autoCleanOnUnload) return;

    const handleUnloadOrPageHide = () => {
      // Must be fast and synchronous without blocking the event loop
      sanitizeClientStorage(validIdsRef.current);
    };

    window.addEventListener('pagehide', handleUnloadOrPageHide);
    window.addEventListener('beforeunload', handleUnloadOrPageHide);

    return () => {
      window.removeEventListener('pagehide', handleUnloadOrPageHide);
      window.removeEventListener('beforeunload', handleUnloadOrPageHide);
      // Also clean up on component unmount
      sanitizeClientStorage(validIdsRef.current);
    };
  }, [autoCleanOnUnload]);

  const runSanitation = useCallback((): StorageSanitationReport => {
    return sanitizeClientStorage(validIdsRef.current);
  }, []);

  return {
    sanitizeStorage: runSanitation
  };
}
