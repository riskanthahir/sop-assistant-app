import React, { useState } from 'react';
import { ArrowLeft, Loader2, Play } from 'lucide-react';
import type { UIStrings } from '../i18n/en';
import type { AppStatusResponse, ChatStreamEvent, DebugPayload, Language } from '../types';

interface DebugViewProps {
  accessCode: string;
  language: Language;
  status: AppStatusResponse | null;
  onBack: () => void;
  onUnauthorized: () => void;
  t: UIStrings;
}

export const DebugView: React.FC<DebugViewProps> = ({
  accessCode,
  language,
  status,
  onBack,
  onUnauthorized,
  t,
}) => {
  const [query, setQuery] = useState('');
  const [minScoreInput, setMinScoreInput] = useState(
    String(status?.minScore ?? 0.42)
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<DebugPayload | null>(null);

  const runDiagnostic = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setRunning(true);
    setError(null);
    setDebugData(null);

    const parsedMin = Number(minScoreInput);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-code': accessCode,
        },
        body: JSON.stringify({
          question: trimmed,
          language,
          includeDebug: true,
          ...(Number.isFinite(parsedMin) ? { minScoreOverride: parsedMin } : {}),
        }),
      });

      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok || !res.body) {
        setError(t.errorGeneric);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const clean = line.trim();
          if (!clean) continue;
          const ev = JSON.parse(clean) as ChatStreamEvent;
          if (ev.type === 'result' && ev.debug) {
            setDebugData(ev.debug);
          } else if (ev.type === 'error') {
            setError(ev.error);
          }
        }
      }
      if (buffer.trim()) {
        const ev = JSON.parse(buffer.trim()) as ChatStreamEvent;
        if (ev.type === 'result' && ev.debug) {
          setDebugData(ev.debug);
        }
      }
    } catch {
      setError(t.errorGeneric);
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-3 sm:px-6 py-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            {t.debug.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t.debug.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 min-h-[44px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.debug.backToChat}
        </button>
      </div>

      {/* Indexed Docs Summary */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t.debug.indexedDocs} ({status?.docsCount ?? 0})
        </h2>
        {status && status.docs.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[460px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3">Document</th>
                  <th className="py-2 pr-3">Revision</th>
                  <th className="py-2 pr-3">Effective</th>
                  <th className="py-2 pr-3 text-right">Pages</th>
                  <th className="py-2 text-right">Chunks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {status.docs.map((d) => (
                  <tr key={d.docId}>
                    <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                      {d.docTitle}
                    </td>
                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{d.revision}</td>
                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-300 tabular-nums">
                      {d.effectiveDate}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{d.pageCount}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{d.chunkCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t.noDocsNotice}</p>
        )}
      </section>

      {/* Diagnostic Form */}
      <form
        onSubmit={(e) => void runDiagnostic(e)}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              {t.debug.queryLabel}
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.askPlaceholder}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              {t.debug.minScoreLabel}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={minScoreInput}
              onChange={(e) => setMinScoreInput(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={running || !query.trim()}
          className="inline-flex items-center gap-2 min-h-[44px] rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 px-4 text-sm font-semibold text-white"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {t.debug.runTest}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {debugData && (
        <div className="space-y-4">
          {/* Score summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t.debug.bestScore}</div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {debugData.bestScore.toFixed(4)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t.debug.threshold}</div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {debugData.minScore.toFixed(2)}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Gate Result</div>
              <div
                className={`mt-1 text-sm font-semibold ${
                  debugData.aboveThreshold
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {debugData.aboveThreshold ? t.debug.aboveThreshold : t.debug.belowThreshold}
              </div>
            </div>
          </div>

          {/* Retrieved Chunks */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t.debug.retrievedChunks} ({debugData.retrievedChunks.length})
            </h3>
            <div className="space-y-2.5">
              {debugData.retrievedChunks.map((chunk) => (
                <div
                  key={chunk.tag}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      <span className="font-mono text-sky-600 dark:text-sky-400 mr-2">
                        [{chunk.tag}]
                      </span>
                      {chunk.docTitle} ({chunk.revision}) · {chunk.chapter} · pp.{chunk.pageStart}-
                      {chunk.pageEnd}
                      {chunk.isNeighbor && (
                        <span className="ml-2 text-slate-500">({t.debug.neighborTag})</span>
                      )}
                    </div>
                    <div className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      total={chunk.combinedScore.toFixed(4)} (cos={chunk.cosineScore.toFixed(4)} + kw=
                      {chunk.keywordBoost.toFixed(4)})
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-xs text-slate-700 dark:text-slate-300 leading-relaxed max-h-48 overflow-y-auto">
                    {chunk.text}
                  </pre>
                </div>
              ))}
            </div>
          </section>

          {/* Raw Model JSON Output */}
          {debugData.rawModelOutput !== null && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t.debug.rawOutput}
              </h3>
              <pre className="overflow-x-auto rounded-xl bg-slate-950 text-slate-100 p-3 font-mono text-xs max-h-96">
                {debugData.rawModelOutput}
              </pre>
            </section>
          )}
        </div>
      )}
    </main>
  );
};
