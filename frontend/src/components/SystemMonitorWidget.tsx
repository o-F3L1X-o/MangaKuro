import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  Sparkles, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Layers,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Server,
  Monitor
} from 'lucide-react';
import { SystemStats } from '../types';
import { fetchSystemStats } from '../api';
import { APP_NAME } from '../version';
import { useTranslation } from '../i18n';

interface SystemMonitorWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  onCleanOrphans?: () => Promise<void> | void;
  isCleaningOrphans?: boolean;
}

export const SystemMonitorWidget: React.FC<SystemMonitorWidgetProps> = ({
  isOpen,
  onClose,
  onCleanOrphans,
  isCleaningOrphans = false
}) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [browserMemoryMb, setBrowserMemoryMb] = useState<number | null>(null);
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    return (localStorage.getItem('mangajutsu_monitor_minimized') || localStorage.getItem('cbz_monitor_minimized')) === 'true';
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timerRef = useRef<any>(null);

  const toggleMinimized = () => {
    setIsMinimized((prev) => {
      const next = !prev;
      localStorage.setItem('mangajutsu_monitor_minimized', String(next));
      return next;
    });
  };

  // Measure browser memory if supported (Chrome/Chromium/Edge)
  const readBrowserMemory = () => {
    if (typeof window !== 'undefined' && (performance as any)?.memory) {
      const usedBytes = (performance as any).memory.usedJSHeapSize;
      if (typeof usedBytes === 'number') {
        setBrowserMemoryMb(Math.round(usedBytes / (1024 * 1024)));
      }
    }
  };

  const loadStats = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      readBrowserMemory();
      const data = await fetchSystemStats();
      setStats(data);
    } catch (err) {
      // Silently keep previous stats if network blips
    } finally {
      if (isManual) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    loadStats();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        loadStats();
        timerRef.current = setInterval(loadStats, 5000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    timerRef.current = setInterval(loadStats, 5000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Percentage color helper
  const getPercentColor = (pct: number) => {
    if (pct < 50) return 'text-emerald-400 bg-emerald-500';
    if (pct < 80) return 'text-amber-400 bg-amber-500';
    return 'text-rose-400 bg-rose-500';
  };

  // Metrics
  const cpuSysPct = stats?.cpu?.system_percent ?? 0;
  const cpuAppPct = stats?.cpu?.process_percent ?? 0;
  
  const ramSysPct = stats?.memory?.system_percent ?? 0;
  const ramSysUsedGb = stats?.memory?.system_used_gb ?? 0;
  const ramSysTotalGb = stats?.memory?.system_total_gb ?? 0;
  
  const ramAppServerMb = stats?.memory?.process_rss_mb ?? 0;
  const ramAppBrowserMb = browserMemoryMb ?? 0;
  const ramAppTotalMb = ramAppServerMb + ramAppBrowserMb;
  
  const ramAppPctOfTotal = ramSysTotalGb > 0 
    ? ((ramAppTotalMb / (ramSysTotalGb * 1024)) * 100)
    : 0;

  const orphansCount = stats?.orphans?.count ?? 0;
  const orphansGb = stats?.orphans?.gb ?? 0;
  const orphansMb = stats?.orphans?.mb ?? 0;
  const stagingGb = stats?.disk?.staging_gb ?? 0;
  const stagingMb = stats?.disk?.staging_mb ?? 0;

  // Minimized Compact Bar
  if (isMinimized) {
    return (
      <div 
        className="fixed top-14 right-4 z-40 flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-comic-900/95 backdrop-blur-md border border-comic-700/80 shadow-2xl text-xs font-mono select-none animate-in fade-in slide-in-from-top-2 duration-150"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>

        {/* CPU comparative */}
        <span className="text-[11px] text-slate-300">
          {t('systemMonitor.thisApp')} CPU: <strong className="text-emerald-400">{cpuAppPct.toFixed(1)}%</strong>
          <span className="text-slate-500 text-[10px] ml-1">(PC {cpuSysPct.toFixed(0)}%)</span>
        </span>
        <span className="text-slate-600">|</span>

        {/* RAM comparative */}
        <span className="text-[11px] text-slate-300">
          {t('systemMonitor.thisApp')} RAM: <strong className="text-emerald-400">{ramAppTotalMb} MB</strong>
          <span className="text-slate-500 text-[10px] ml-1">(PC {ramSysPct.toFixed(0)}% · {ramSysUsedGb}GB)</span>
        </span>
        <span className="text-slate-600">|</span>

        {/* Disk */}
        <span className="text-[11px] text-slate-300">
          {t('systemMonitor.tempShort') || 'En Prep:'} <span className="font-bold text-indigo-300">{stagingGb > 0 ? `${stagingGb}G` : `${stagingMb}M`}</span>
        </span>

        {orphansCount > 0 && (
          <>
            <span className="text-slate-600">|</span>
            <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1 animate-pulse">
              ⚠️ {orphansCount} {t('systemMonitor.orphansShort')}
            </span>
          </>
        )}

        <button
          onClick={toggleMinimized}
          className="p-1 rounded hover:bg-comic-800 text-slate-400 hover:text-white transition cursor-pointer"
          title={t('systemMonitor.expand')}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-comic-800 text-slate-400 hover:text-rose-400 transition cursor-pointer"
          title={t('systemMonitor.close')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Expanded Detailed Card with Explicit System vs App Comparison
  return (
    <div 
      className="fixed top-14 right-4 z-40 w-80 sm:w-96 rounded-2xl bg-comic-950/95 backdrop-blur-md border border-comic-700/90 shadow-2xl text-slate-200 text-xs overflow-hidden select-none animate-in fade-in slide-in-from-top-2 duration-150"
    >
      {/* Header */}
      <div className="px-4 py-2.5 bg-comic-900/90 border-b border-comic-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-bold text-white text-xs tracking-tight">{t('systemMonitor.title')}</span>
          <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 font-mono font-bold">
            {t('systemMonitor.live')}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => loadStats(true)}
            className="p-1 rounded hover:bg-comic-800 text-slate-400 hover:text-white transition cursor-pointer"
            title={t('systemMonitor.refreshNow')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
          <button
            onClick={toggleMinimized}
            className="p-1 rounded hover:bg-comic-800 text-slate-400 hover:text-white transition cursor-pointer"
            title={t('systemMonitor.minimize')}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-comic-800 text-slate-400 hover:text-rose-400 transition cursor-pointer"
            title={t('systemMonitor.close')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3.5">
        {/* Informational Callout */}
        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[10px] text-slate-300 leading-relaxed">
          {t('systemMonitor.infoCallout', {
            appRam: ramAppTotalMb,
            appCpu: cpuAppPct.toFixed(1),
            sysCpu: cpuSysPct.toFixed(0),
            sysRam: ramSysPct.toFixed(0)
          })}
        </div>
        {/* CPU Comparative Block */}
        <div className="p-3 rounded-xl bg-comic-900/50 border border-comic-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <div className="flex items-center gap-1.5 text-slate-200">
              <Cpu className="w-4 h-4 text-sky-400 shrink-0" />
              <span>{t('systemMonitor.cpuUsage')}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {t('systemMonitor.totalPc')} <strong className={cpuSysPct > 75 ? 'text-rose-400' : 'text-white'}>{cpuSysPct.toFixed(1)}%</strong>
            </span>
          </div>

          {/* System CPU Bar */}
          <div className="space-y-1 font-mono text-[10px]">
            <div className="flex justify-between text-slate-400">
              <span className="flex items-center gap-1">
                <Monitor className="w-3 h-3 text-slate-400" />
                <span>{t('systemMonitor.systemGlobal')}</span>
              </span>
              <span className="font-bold text-slate-200">{cpuSysPct.toFixed(1)}%</span>
            </div>
            <div className="w-full h-1.5 bg-comic-800 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${getPercentColor(cpuSysPct).split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(2, cpuSysPct))}%` }}
              />
            </div>
          </div>

          {/* App CPU Bar */}
          <div className="space-y-1 font-mono text-[10px] pt-1">
            <div className="flex justify-between text-slate-400">
              <span className="flex items-center gap-1 text-indigo-300 font-semibold">
                <Server className="w-3 h-3 text-indigo-400" />
                <span>{APP_NAME}</span>
              </span>
              <span className="font-bold text-indigo-300">{cpuAppPct.toFixed(1)}%</span>
            </div>
            <div className="w-full h-1.5 bg-comic-800 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(1, cpuAppPct))}%` }}
              />
            </div>
          </div>
        </div>

        {/* RAM Comparative Block */}
        <div className="p-3 rounded-xl bg-comic-900/50 border border-comic-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <div className="flex items-center gap-1.5 text-slate-200">
              <Activity className="w-4 h-4 text-purple-400 shrink-0" />
              <span>{t('systemMonitor.ramMemory')}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {t('systemMonitor.totalPc')} <strong className={ramSysPct > 80 ? 'text-rose-400' : 'text-white'}>{ramSysPct.toFixed(0)}%</strong>
            </span>
          </div>

          {/* System RAM */}
          <div className="space-y-1 font-mono text-[10px]">
            <div className="flex justify-between text-slate-400">
              <span className="flex items-center gap-1">
                <Monitor className="w-3 h-3 text-slate-400" />
                <span>{t('systemMonitor.ramInUse')}</span>
              </span>
              <span className="font-bold text-slate-200">
                {ramSysUsedGb} / {ramSysTotalGb} GB ({ramSysPct.toFixed(0)}%)
              </span>
            </div>
            <div className="w-full h-1.5 bg-comic-800 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${getPercentColor(ramSysPct).split(' ')[1]}`}
                style={{ width: `${Math.min(100, Math.max(2, ramSysPct))}%` }}
              />
            </div>
          </div>

          {/* App RAM Breakdown */}
          <div className="pt-1.5 border-t border-comic-800/80 space-y-1 text-[10px] font-mono">
            <div className="flex items-center justify-between">
              <span className="text-indigo-300 font-semibold flex items-center gap-1">
                <Server className="w-3 h-3 text-indigo-400" />
                <span>{t('systemMonitor.totalApp')}</span>
              </span>
              <span className="font-bold text-emerald-400">
                {ramAppTotalMb} MB <span className="text-slate-500 text-[9px]">{t('systemMonitor.pctOfPc', { pct: ramAppPctOfTotal.toFixed(1) })}</span>
              </span>
            </div>
            <div className="flex justify-between text-slate-400 text-[9px] pl-4">
              <span>{t('systemMonitor.serverPython')} <strong>{ramAppServerMb} MB</strong></span>
              {ramAppBrowserMb > 0 && (
                <span>{t('systemMonitor.browserUi')} <strong>{ramAppBrowserMb} MB</strong></span>
              )}
            </div>
          </div>
        </div>

        {/* Disk & Staging */}
        <div className="p-3 rounded-xl bg-comic-900/50 border border-comic-800 space-y-1.5 text-[11px] font-mono">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
              <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{t('systemMonitor.storage')}</span>
            </div>
            <span className="font-bold text-indigo-300">
              {t('systemMonitor.appStorage')} {stagingGb > 0 ? `${stagingGb} GB` : `${stagingMb} MB`}
            </span>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>{t('systemMonitor.comicsInStaging')} <strong className="text-slate-200">{stats?.active_sessions ?? 0}</strong></span>
            {stats?.disk && (
              <span>{t('systemMonitor.freeSpacePc')} <strong className="text-emerald-400">{stats.disk.drive_free_gb} GB</strong></span>
            )}
          </div>
        </div>

        {/* Orphans Status & Cleaner */}
        <div className="pt-0.5">
          {orphansCount === 0 ? (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{t('systemMonitor.zeroOrphans')}</span>
              </div>
              <span className="text-[10px] text-emerald-400/80 font-mono">{t('systemMonitor.spaceOptimized')}</span>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-700/80 text-amber-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
                  <span className="font-bold text-xs">
                    {orphansCount === 1 
                      ? t('systemMonitor.singleOrphanDetected') 
                      : t('systemMonitor.orphansDetected', { count: orphansCount })}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-amber-300">
                  {orphansGb > 0 ? `${orphansGb} GB` : `${orphansMb} MB`}
                </span>
              </div>
              {onCleanOrphans && (
                <button
                  onClick={onCleanOrphans}
                  disabled={isCleaningOrphans}
                  className="w-full py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isCleaningOrphans ? 'animate-spin' : ''}`} />
                  <span>{isCleaningOrphans ? t('systemMonitor.cleaning') : t('systemMonitor.freeOrphanSpace')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
