import React, { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import type { UIStrings } from '../i18n/en';

interface AccessGateProps {
  appName: string;
  accessConfigured: boolean;
  onUnlock: (code: string) => void;
  t: UIStrings;
}

export const AccessGate: React.FC<AccessGateProps> = ({
  appName,
  accessConfigured,
  onUnlock,
  t,
}) => {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/verify-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: trimmed }),
      });
      const data = (await res.json()) as { ok?: boolean; configured?: boolean; message?: string };
      if (res.ok && data.ok) {
        onUnlock(trimmed);
      } else if (data.configured === false) {
        setError(t.accessGate.notConfigured);
      } else {
        setError(t.accessGate.invalid);
      }
    } catch {
      setError(t.errorGeneric);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
          <ShieldCheck className="h-6 w-6" />
        </div>

        <h1 className="mt-4 font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          {appName} — {t.accessGate.title}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {t.accessGate.subtitle}
        </p>

        {!accessConfigured && (
          <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-300">
            {t.accessGate.notConfigured}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="password"
              autoComplete="current-password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t.accessGate.placeholder}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-4 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          {error && (
            <p className="text-sm font-medium text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={checking || !code.trim()}
            className="w-full min-h-[48px] rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {checking ? t.accessGate.checking : t.accessGate.submit}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          {t.accessGate.rememberNote}
        </p>
      </div>
    </div>
  );
};
