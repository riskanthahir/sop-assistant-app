import React from 'react';
import { Clock, Trash2, WifiOff, X } from 'lucide-react';
import type { UIStrings } from '../i18n/en';
import type { SavedQA } from '../types';

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  items: SavedQA[];
  onSelect: (item: SavedQA) => void;
  onClear: () => void;
  t: UIStrings;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  open,
  onClose,
  items,
  onSelect,
  onClear,
  t,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              {t.historyTitle}
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <WifiOff className="h-3.5 w-3.5" />
              {t.historyOfflineNote} · {items.length}/20
            </p>
          </div>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 min-h-[40px] text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t.clearHistory}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {t.historyEmpty}
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-sky-400 dark:hover:border-sky-600 p-3.5 min-h-[60px] transition-colors"
              >
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
                  {item.question}
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                  <span aria-hidden="true">·</span>
                  <span className="uppercase">{item.language}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
};
