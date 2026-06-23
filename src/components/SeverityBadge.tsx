import { SeverityLevel } from '@/lib/types';
import { cn } from '@/lib/utils';

const severityConfig: Record<SeverityLevel, { label: string; className: string }> = {
  low: { label: 'LOW', className: 'bg-severity-low/15 text-severity-low border-severity-low/30' },
  medium: { label: 'MED', className: 'bg-severity-medium/15 text-severity-medium border-severity-medium/30' },
  high: { label: 'HIGH', className: 'bg-severity-high/15 text-severity-high border-severity-high/30' },
  critical: { label: 'CRIT', className: 'bg-severity-critical/15 text-severity-critical border-severity-critical/30' },
};

export function SeverityBadge({ severity, className }: { severity: SeverityLevel; className?: string }) {
  const config = severityConfig[severity];
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-semibold tracking-wider border',
      config.className,
      severity === 'critical' && 'animate-pulse-glow',
      className
    )}>
      {config.label}
    </span>
  );
}
