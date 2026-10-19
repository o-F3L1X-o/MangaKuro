/**
 * Storage and Memory Sanitizer Utility
 * 
 * Manages client-side storage lifecycle:
 * 1. Object URL tracking & leak-free revocation (URL.createObjectURL / URL.revokeObjectURL).
 * 2. LocalStorage hygiene: prunes stale session IDs, invalid JSON, and temporary keys.
 * 3. Cache Storage & SessionStorage cleanup without blocking the main thread.
 * 4. Safe execution on pagehide/beforeunload and during browser idle periods.
 */

const trackedObjectUrls = new Set<string>();

/**
 * Creates a tracked Object URL that is registered in the cleanup registry.
 */
export function createTrackedObjectURL(object: Blob | MediaSource): string {
  const url = URL.createObjectURL(object);
  trackedObjectUrls.add(url);
  return url;
}

/**
 * Revokes a tracked Object URL and removes it from the registry.
 */
export function revokeTrackedObjectURL(url: string | null | undefined): void {
  if (!url) return;
  if (trackedObjectUrls.has(url)) {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Error revoking Object URL:', e);
    }
    trackedObjectUrls.delete(url);
  }
}

/**
 * Revokes all currently tracked Object URLs to release memory immediately.
 */
export function revokeAllTrackedObjectURLs(): number {
  const count = trackedObjectUrls.size;
  trackedObjectUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  });
  trackedObjectUrls.clear();
  return count;
}

export interface StorageSanitationReport {
  revokedBlobUrls: number;
  prunedLocalStorageKeys: string[];
  prunedSessionIds: string[];
  cleanedCaches: number;
  freedEstimateBytes: number;
}

/**
 * Prunes stale entries from localStorage and browser caches.
 * Non-blocking, safe for beforeunload / pagehide.
 */
export function sanitizeClientStorage(validSessionIds?: string[]): StorageSanitationReport {
  const report: StorageSanitationReport = {
    revokedBlobUrls: 0,
    prunedLocalStorageKeys: [],
    prunedSessionIds: [],
    cleanedCaches: 0,
    freedEstimateBytes: 0
  };

  // 1. Revoke any pending Object URLs
  report.revokedBlobUrls = revokeAllTrackedObjectURLs();

  if (typeof window === 'undefined' || !window.localStorage) {
    return report;
  }

  // 2. Sanitize LocalStorage
  try {
    const keysToRemove: string[] = [];
    const validSet = validSessionIds ? new Set(validSessionIds) : null;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Identify temporary or legacy keys
      if (
        key.startsWith('temp_') || 
        key.startsWith('cbz_temp_') || 
        key.startsWith('mangajutsu_temp_') || 
        key.startsWith('_scratch_') ||
        key.endsWith('_transient')
      ) {
        keysToRemove.push(key);
      }
    }

    // Prune stale session IDs from saved order list
    if (validSet) {
      const savedOrderStr = localStorage.getItem('mangajutsu_sessions_order') || localStorage.getItem('comic_sessions_order');
      if (savedOrderStr) {
        try {
          const parsed: string[] = JSON.parse(savedOrderStr);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((id) => validSet.has(id));
            if (filtered.length !== parsed.length) {
              const diff = parsed.filter((id) => !validSet.has(id));
              report.prunedSessionIds.push(...diff);
              localStorage.setItem('mangajutsu_sessions_order', JSON.stringify(filtered));
            }
          }
        } catch {
          keysToRemove.push('mangajutsu_sessions_order');
          keysToRemove.push('comic_sessions_order');
        }
      }

      // Check active session ID: if it no longer exists, clear it
      const activeId = localStorage.getItem('mangajutsu_active_session_id') || localStorage.getItem('cbz_active_session_id');
      if (activeId && !validSet.has(activeId)) {
        localStorage.removeItem('mangajutsu_active_session_id');
        localStorage.removeItem('cbz_active_session_id');
        report.prunedLocalStorageKeys.push('mangajutsu_active_session_id');
      }
    }

    // Remove identified temporary keys
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
        report.prunedLocalStorageKeys.push(k);
      } catch {}
    });
  } catch (err) {
    console.warn('Non-critical warning during localStorage sanitation:', err);
  }

  // 3. Clear transient CacheStorage if supported
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      caches.keys().then((cacheNames) => {
        cacheNames.forEach((name) => {
          if (name.includes('temp') || name.includes('transient') || name.includes('scratch')) {
            caches.delete(name);
            report.cleanedCaches += 1;
          }
        });
      }).catch(() => {});
    } catch {}
  }

  return report;
}

/**
 * Schedules non-blocking storage sanitation during browser idle time.
 */
export function scheduleIdleSanitation(validSessionIds?: string[]): void {
  if (typeof window === 'undefined') return;

  const runTask = () => {
    try {
      sanitizeClientStorage(validSessionIds);
    } catch (e) {
      console.warn('Background idle sanitation error:', e);
    }
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(runTask, { timeout: 3000 });
  } else {
    setTimeout(runTask, 1500);
  }
}
