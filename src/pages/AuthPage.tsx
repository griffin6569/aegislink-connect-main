import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isNativeApp } from '@/lib/platform';
import { Shield, Mail, Lock, User, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

function isRecoveryLink() {
  if (typeof window === 'undefined') return false;

  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);

  return (
    searchParams.get('mode') === 'recovery' ||
    searchParams.get('type') === 'recovery' ||
    hashParams.get('type') === 'recovery'
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const recoveryNoticeShown = useRef(false);
  const [mode, setMode] = useState<AuthMode>(() => (isRecoveryLink() ? 'reset' : 'login'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';
  const isForgotPassword = mode === 'forgot';
  const isResetPassword = mode === 'reset';

  useEffect(() => {
    const openedFromRecoveryLink = isRecoveryLink();

    if (openedFromRecoveryLink) {
      setMode('reset');
    }

    const syncRecoveryState = (nextEmail?: string | null, announce = false) => {
      setMode('reset');
      setPassword('');
      setConfirmPassword('');
      if (nextEmail) {
        setEmail(nextEmail);
      }

      if (announce && !recoveryNoticeShown.current) {
        toast.info('Create a new password to finish account recovery.');
        recoveryNoticeShown.current = true;
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (openedFromRecoveryLink && session?.user) {
        syncRecoveryState(session.user.email, false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        syncRecoveryState(session?.user?.email, true);
        return;
      }

      if (openedFromRecoveryLink && event === 'SIGNED_IN' && session?.user) {
        syncRecoveryState(session.user.email, false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);

    if (nextMode !== 'signup') {
      setName('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isResetPassword && password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Signed in successfully');
        navigate('/');
      } else if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        });
        if (error) throw error;
        toast.success('Account created! Check your email to confirm.');
      } else if (isForgotPassword) {
        const redirectTo =
          !isNativeApp() && typeof window !== 'undefined'
            ? `${window.location.origin}/auth?mode=recovery`
            : undefined;

        const { error } = await supabase.auth.resetPasswordForEmail(
          email,
          redirectTo ? { redirectTo } : undefined
        );
        if (error) throw error;
        toast.success('Password reset link sent. Check your email.');
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success('Password updated successfully');
        navigate('/');
      }
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const modeTitle = isLogin
    ? 'Sign In'
    : isSignup
      ? 'Create Account'
      : isForgotPassword
        ? 'Forgot Password'
        : 'Reset Password';

  const modeDescription = isLogin
    ? 'Access your AegisLink workspace.'
    : isSignup
      ? 'Create an account to access field intelligence tools.'
      : isForgotPassword
        ? 'Enter your email and we will send a password reset link.'
        : email
          ? `Set a new password for ${email}.`
          : 'Set a new password to finish account recovery.';

  const submitLabel = isLogin
    ? 'Sign In'
    : isSignup
      ? 'Create Account'
      : isForgotPassword
        ? 'Send Reset Link'
        : 'Update Password';

  return (
    <div className="min-h-screen bg-background bg-grid flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4 glow-primary">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">AegisLink AI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Public Safety Intelligence Platform
          </p>
          <div className="mt-4 space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{modeTitle}</h2>
            <p className="text-sm text-muted-foreground">{modeDescription}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignup && (
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
                className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
            </div>
          )}

          {!isResetPassword && (
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
            </div>
          )}

          {!isForgotPassword && (
            <div className="space-y-3">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={isResetPassword ? 'New Password' : 'Password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-10 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {isResetPassword && (
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm New Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-10 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {isLogin && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-sm text-primary hover:underline font-medium"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 glow-primary transition-all"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <>
                {submitLabel}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center text-sm text-muted-foreground mt-6 space-y-2">
          {isLogin && (
            <p>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="text-primary hover:underline font-medium"
              >
                Sign Up
              </button>
            </p>
          )}

          {isSignup && (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-primary hover:underline font-medium"
              >
                Sign In
              </button>
            </p>
          )}

          {isForgotPassword && (
            <p>
              Remembered your password?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-primary hover:underline font-medium"
              >
                Back to Sign In
              </button>
            </p>
          )}

          {isResetPassword && (
            <p>
              Need a new recovery link?{' '}
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-primary hover:underline font-medium"
              >
                Send Another Email
              </button>
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
