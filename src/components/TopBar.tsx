import React, { useState } from 'react';
import {
  Bug,
  Download,
  History,
  Lock,
  MessageSquare,
  Moon,
  Radio,
  Share,
  Sun,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { LANGUAGE_OPTIONS } from '../i18n';
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
      <header className="sticky top-0 z-40 w-full pt-safe border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xs">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 sm:px-6">
          {/* Brand icon only */}
          <button
            type="button"
            onClick={() => onNavigate('chat')}
            aria-label={appName}
            title={appName}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-xs hover:bg-sky-700 transition-colors"
          >
            <Radio className="h-5 w-5" />
          </button>

          {/* Independent circular first-letter language buttons */}
          <div
            role="group"
            aria-label="Language"
            className="flex items-center gap-1.5 shrink-0"
          >
            {LANGUAGE_OPTIONS.map((opt) => {
              const active = language === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => onLanguageChange(opt.code)}
                  aria-label={opt.label}
                  title={opt.label}
                  aria-pressed={active}
                  className={`inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-xs font-bold leading-none shrink-0 border transition-colors ${
                    active
                      ? 'border-sky-600 bg-sky-600 text-white shadow-xs dark:border-sky-500 dark:bg-sky-500'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-sky-400 hover:text-sky-700 dark:hover:text-sky-300'
                  }`}
                >
                  {opt.shortLabel}
                </button>
              );
            })}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={() => void install()}
                aria-label={t.installButton}
                title={t.installButton}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-2 sm:px-2.5 min-h-[38px] sm:min-h-[40px] text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
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
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2 sm:px-2.5 min-h-[38px] sm:min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
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
                className="relative inline-flex items-center justify-center min-h-[40px] min-w-[38px] sm:min-h-[44px] sm:min-w-[44px] rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <History className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
                {historyCount > 0 && (
                  <span className="sr-only">({historyCount})</span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onToggleDark}
              aria-label={dark ? 'Light mode' : 'Dark mode'}
              className="inline-flex items-center justify-center min-h-[40px] min-w-[38px] sm:min-h-[44px] sm:min-w-[44px] rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {dark ? (
                <Sun className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
              ) : (
                <Moon className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
              )}
            </button>

            {isUnlocked && (
              <button
                type="button"
                onClick={() => onNavigate(route === 'debug' ? 'chat' : 'debug')}
                aria-label={route === 'debug' ? t.navChat : t.navDebug}
                title={route === 'debug' ? t.navChat : t.navDebug}
                className={`inline-flex items-center justify-center min-h-[40px] min-w-[38px] sm:min-h-[44px] sm:min-w-[44px] rounded-lg transition-colors ${
                  route === 'debug'
                    ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {route === 'debug' ? (
                  <MessageSquare className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
                ) : (
                  <Bug className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
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
