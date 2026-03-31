import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Home, Smartphone, Monitor, ShieldCheck, Zap } from 'lucide-react';

export default function InstallApp() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-800">
        <div className="p-8 text-center bg-gradient-to-b from-emerald-900/40 to-zinc-900">
          <div className="w-24 h-24 bg-emerald-500 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
            <Download className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Install App</h1>
          <p className="text-zinc-400">Get the best experience by installing our app on your device.</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-800/50 p-4 rounded-xl flex flex-col items-center text-center">
              <Zap className="w-6 h-6 text-emerald-400 mb-2" />
              <span className="text-sm font-medium">Fast Access</span>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded-xl flex flex-col items-center text-center">
              <Monitor className="w-6 h-6 text-emerald-400 mb-2" />
              <span className="text-sm font-medium">Full Screen</span>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded-xl flex flex-col items-center text-center">
              <Smartphone className="w-6 h-6 text-emerald-400 mb-2" />
              <span className="text-sm font-medium">Mobile Ready</span>
            </div>
            <div className="bg-zinc-800/50 p-4 rounded-xl flex flex-col items-center text-center">
              <ShieldCheck className="w-6 h-6 text-emerald-400 mb-2" />
              <span className="text-sm font-medium">Secure</span>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-zinc-800">
            {isInstalled ? (
              <div className="bg-emerald-500/10 text-emerald-400 p-4 rounded-xl text-center font-medium">
                App is already installed!
              </div>
            ) : (
              <button
                onClick={handleInstall}
                disabled={!isInstallable}
                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                  isInstallable 
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' 
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                <Download className="w-5 h-5" />
                {isInstallable ? 'Install Now' : 'Install Not Available'}
              </button>
            )}
            
            <button
              onClick={() => navigate('/')}
              className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white transition-all"
            >
              <Home className="w-5 h-5" />
              Go to Home
            </button>
          </div>
          
          {!isInstallable && !isInstalled && (
            <p className="text-xs text-center text-zinc-500 mt-4">
              To install, open this page in Safari on iOS and tap "Share" &gt; "Add to Home Screen", or use Chrome on Android/Desktop.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
