import React, { useState } from 'react';
import {
  Bug,
  Download,
  History,
  Lock,
  MessageSquare,
  Moon,
  Share,
  Sun,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { UIStrings } from '../i18n/en';
import type { Language } from '../types';

interface TopBarProps {
  appName: string;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  dark: boolean;
  onToggleDark: () => void;
  route: 'chat' | 'debug';
  onNavigate: (route: 'chat' | 'debug') => void;
  onOpenHistory: () => void;
  historyCount: number;
  isUnlocked: boolean;
  accessConfigured: boolean;
  onLock: () => void;
  t: UIStrings;
}

const LANG_OPTIONS: Array<{ code: Language; label: string }> = [
  { code: 'en', label: 'EN' },
  { code: 'si', label: 'සිංහල' },
  { code: 'ta', label: 'தமிழ்' },
];

export const TopBar: React.FC<TopBarProps> = ({
  appName,
  language,
  onLanguageChange,
  dark,
  onToggleDark,
  route,
  onNavigate,
  onOpenHistory,
  historyCount,
  isUnlocked,
  accessConfigured,
  onLock,
  t,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 pt-safe border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 sm:px-6">
          {/* Brand title */}
          <button
            type="button"
            onClick={() => onNavigate('chat')}
            className="text-left font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 min-h-[44px] flex items-center"
          >
            {appName}
          </button>

          {/* Language Switcher */}
          <div
            role="group"
            aria-label="Language"
            className="flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 shrink-0"
          >
            {LANG_OPTIONS.map((opt) => {
              const active = language === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => onLanguageChange(opt.code)}
                  className={`px-2 sm:px-2.5 min-h-[36px] rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-white dark:bg-slate-950 text-sky-700 dark:text-sky-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 shrink-0">
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={() => void install()}
                aria-label={t.installButton}
                title={t.installButton}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-2.5 min-h-[40px] text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">{t.installButton}</span>
              </button>
            )}

            {!isInstalled && !isInstallable && isIOS && (
              <button
                type="button"
                onClick={() => setShowIOSModal(true)}
                aria-label={t.installIosButton}
                title={t.installIosButton}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">{t.installIosButton}</span>
              </button>
            )}

            {isUnlocked && (
              <button
                type="button"
                onClick={onOpenHistory}
                aria-label={t.historyButton}
                title={t.historyButton}
                className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <History className="h-5 w-5" />
                {historyCount > 0 && (
                  <span className="sr-only">({historyCount})</span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onToggleDark}
              aria-label={dark ? 'Light mode' : 'Dark mode'}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {isUnlocked && (
              <button
                type="button"
                onClick={() => onNavigate(route === 'debug' ? 'chat' : 'debug')}
                aria-label={route === 'debug' ? t.navChat : t.navDebug}
                title={route === 'debug' ? t.navChat : t.navDebug}
                className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg transition-colors ${
                  route === 'debug'
                    ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {route === 'debug' ? (
                  <MessageSquare className="h-5 w-5" />
                ) : (
                  <Bug className="h-5 w-5" />
                )}
              </button>
            )}

            {isUnlocked && accessConfigured && (
              <button
                type="button"
                onClick={onLock}
                aria-label={t.accessGate.signOut}
                title={t.accessGate.signOut}
                className="hidden sm:inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Lock className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t.installIosTitle}
            </h3>
            <ol className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="font-mono font-semibold text-sky-600 dark:text-sky-400">1.</span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {t.installIosStep1}
                  <Share className="h-4 w-4 inline text-sky-600 dark:text-sky-400" />
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-mono font-semibold text-sky-600 dark:text-sky-400">2.</span>
                <span>{t.installIosStep2}</span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="mt-6 w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
