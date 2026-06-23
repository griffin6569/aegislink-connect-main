import { useEffect, useMemo, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { toast } from 'sonner';

const DISMISS_KEY = 'aegis_pwa_install_dismissed';

function isStandaloneMode() {
  const mediaStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(mediaStandalone || iosStandalone);
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PwaInstallPrompt() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === 'true');
    setStandalone(isStandaloneMode());
  }, []);

  const shouldShow = useMemo(() => {
    if (standalone || dismissed) {
      return false;
    }

    return canInstall || isIosDevice();
  }, [canInstall, dismissed, standalone]);

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] px-4 md:bottom-6">
      <div className="mx-auto max-w-lg rounded-2xl border border-primary/25 bg-surface-elevated/95 p-4 shadow-2xl backdrop-blur-xl pointer-events-auto">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Install AegisLink for offline use</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Install the app on this device so it can reopen faster and keep using cached reports plus AegisMesh features when the internet drops.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  if (canInstall) {
                    const accepted = await promptInstall();
                    if (accepted) {
                      toast.success('Install prompt opened');
                    }
                    return;
                  }

                  setShowIosGuide((current) => !current);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Download className="h-4 w-4" />
                {canInstall ? 'Install App' : 'How to Install'}
              </button>

              <button
                onClick={() => {
                  setDismissed(true);
                  localStorage.setItem(DISMISS_KEY, 'true');
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
                Later
              </button>
            </div>

            {showIosGuide && !canInstall && (
              <div className="mt-3 rounded-lg border border-border bg-background/70 p-3 text-[11px] leading-5 text-muted-foreground">
                On iPhone or iPad, tap the browser share button, then choose <span className="font-semibold text-foreground">Add to Home Screen</span>.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
