import { Home, Plus, Map, Radio, ShieldCheck } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { EmergencyButton } from './EmergencyButton';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: Home, label: 'Feed', path: '/' },
    { icon: Map, label: 'Map', path: '/map' },
    { icon: null, label: 'SOS', path: null },
    { icon: Radio, label: 'Mesh', path: '/mesh' },
    { icon: Plus, label: 'Report', path: '/report' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface-elevated/95 backdrop-blur-xl border-t border-border">
      <div className="flex items-center justify-around px-2 py-1 max-w-lg mx-auto">
        {navItems.map((item, i) => {
          if (item.icon === null) {
            return (
              <div key={i} className="flex items-center justify-center -mt-6">
                <EmergencyButton />
              </div>
            );
          }

          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path!)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
