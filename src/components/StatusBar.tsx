import { Wifi, WifiOff, Shield, Clock, RefreshCw } from 'lucide-react';
import { useSyncEngine } from '@/lib/sync-engine';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function StatusBar() {
  const { status, pendingCount } = useSyncEngine();
  const [time, setTime] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-surface-elevated border-b border-border">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
        <Shield className="h-4 w-4 text-primary" />
        <span className="font-mono text-xs font-semibold tracking-wider text-primary">
          AEGISLINK
        </span>
      </div>

      <div className="flex items-center gap-3">
        {pendingCount > 0 && (
          <div className="flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3 text-status-syncing animate-spin" />
            <span className="font-mono text-[10px] text-status-syncing">{pendingCount}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-xs text-muted-foreground">
            {time.toLocaleTimeString('en-US', { hour12: false })}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {status === 'online' ? (
            <>
              <Wifi className="h-3 w-3 text-status-online" />
              <span className="font-mono text-xs text-status-online">ONLINE</span>
            </>
          ) : status === 'syncing' ? (
            <>
              <RefreshCw className="h-3 w-3 text-status-syncing animate-spin" />
              <span className="font-mono text-xs text-status-syncing">SYNCING</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-status-offline animate-pulse-glow" />
              <span className="font-mono text-xs text-status-offline">OFFLINE</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
