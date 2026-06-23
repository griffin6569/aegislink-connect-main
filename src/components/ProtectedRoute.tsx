import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, ShieldOff } from 'lucide-react';

type AppRole = 'admin' | 'moderator' | 'user' | 'authority';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: AppRole;
  requireAuth?: boolean;
}

export function ProtectedRoute({ children, requiredRole, requireAuth = true }: ProtectedRouteProps) {
  const { user, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <span className="text-xs font-mono text-muted-foreground">Authenticating...</span>
        </div>
      </div>
    );
  }

  if (requireAuth && !user) {
    return <Navigate to="/auth" replace />;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <div className="w-16 h-16 rounded-full bg-severity-critical/10 flex items-center justify-center">
            <ShieldOff className="h-8 w-8 text-severity-critical" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Access Denied</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            You don't have permission to access this area. Admin privileges are required.
          </p>
          <a href="/" className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            Go Home
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
