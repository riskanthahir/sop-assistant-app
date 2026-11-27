import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Send, WifiOff } from 'lucide-react';
import { useSpeechInput } from '../hooks/useSpeechInput';
import { SAFETY_FOOTER_ALL_LANGUAGES } from '../i18n';
import type { UIStrings } from '../i18n/en';
import type { ChatStreamEvent, Language, SavedQA } from '../types';
import { AnswerView } from './AnswerView';

interface ChatViewProps {
  language: Language;
  accessCode: string;
  docsCount: number;
  reportUrl: string;
  isOnline: boolean;
  dark: boolean;
  activeQA: SavedQA | null;
  lastQuestion: string;
  onSaveQA: (qa: SavedQA) => void;
  onUnauthorized: () => void;
  t: UIStrings;
}

export const ChatView: React.FC<ChatViewProps> = ({
  language,
  accessCode,
  docsCount,
  reportUrl,
  isOnline,
  dark,
  activeQA,
  lastQuestion,
  onSaveQA,
  onUnauthorized,
  t,
}) => {
  const [input, setInput] = useState('');
  const [loadingStage, setLoadingStage] = useState<'searching' | 'writing' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentQA, setCurrentQA] = useState<SavedQA | null>(activeQA);
  const [answerLang, setAnswerLang] = useState<Language>(activeQA?.language || language);
  const [translatingLang, setTranslatingLang] = useState<Language | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const answerTopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCurrentQA(activeQA);
    setAnswerLang(activeQA?.language || language);
    setTranslateError(null);
    setTranslatingLang(null);
  }, [activeQA, language]);

  const speech = useSpeechInput(language, (transcript) => {
    setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
  });

  const handleTranslateAnswer = async (targetLang: Language) => {
    if (!currentQA || translatingLang) return;
    setTranslateError(null);

    if (targetLang === currentQA.language || currentQA.translations?.[targetLang]) {
      setAnswerLang(targetLang);
      return;
    }

    if (!isOnline) {
      setTranslateError(t.offlineBanner);
      return;
    }

    setTranslatingLang(targetLang);
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-code': accessCode,
        },
        body: JSON.stringify({
          answer: currentQA.answer,
          targetLanguage: targetLang,
        }),
      });

      if (response.status === 401) {
        onUnauthorized();
        return;
      }

      if (!response.ok) {
        let msg = t.translateError;
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson.error) msg = errJson.error;
        } catch {
          // ignore
        }
        setTranslateError(msg);
        return;
      }

      const data = (await response.json()) as { answer?: SavedQA['answer'] };
      if (!data.answer) {
        setTranslateError(t.translateError);
        return;
      }

      const updatedQA: SavedQA = {
        ...currentQA,
        translations: {
          ...(currentQA.translations || {}),
          [targetLang]: data.answer,
        },
      };
      setCurrentQA(updatedQA);
      setAnswerLang(targetLang);
      onSaveQA(updatedQA);
    } catch {
      setTranslateError(t.translateError);
    } finally {
      setTranslatingLang(null);
    }
  };

  const submitQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loadingStage) return;

    if (!isOnline) {
      setErrorMsg(t.offlineBanner);
      return;
    }

    setErrorMsg(null);
    setLoadingStage('searching');
    speech.stop();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-code': accessCode,
        },
        body: JSON.stringify({
          question: trimmed,
          previousQuestion: lastQuestion,
          language,
        }),
      });

      if (response.status === 401) {
        onUnauthorized();
        return;
      }

      if (!response.ok || !response.body) {
        let msg = t.errorGeneric;
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson.error) msg = errJson.error;
        } catch {
          // ignore
        }
        setErrorMsg(msg);
        setLoadingStage(null);
        return;
      }

      const reader = response.body.getReader();
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
          const event = JSON.parse(clean) as ChatStreamEvent;
          if (event.type === 'stage') {
            if (event.stage === 'searching' || event.stage === 'writing') {
              setLoadingStage(event.stage);
            } else if (event.stage === 'done') {
              setLoadingStage(null);
            }
          } else if (event.type === 'result') {
            const saved: SavedQA = {
              id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              question: trimmed,
              language,
              createdAt: new Date().toISOString(),
              answer: event.answer,
            };
            setCurrentQA(saved);
            setAnswerLang(language);
            setTranslateError(null);
            onSaveQA(saved);
            setInput('');
            setTimeout(() => {
              answerTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
          } else if (event.type === 'error') {
            setErrorMsg(event.error || t.errorGeneric);
            setLoadingStage(null);
          }
        }
      }

      if (buffer.trim()) {
        const event = JSON.parse(buffer.trim()) as ChatStreamEvent;
        if (event.type === 'result') {
          const saved: SavedQA = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            question: trimmed,
            language,
            createdAt: new Date().toISOString(),
            answer: event.answer,
          };
          setCurrentQA(saved);
          setAnswerLang(language);
          setTranslateError(null);
          onSaveQA(saved);
          setInput('');
        } else if (event.type === 'error') {
          setErrorMsg(event.error || t.errorGeneric);
        }
      }
    } catch {
      setErrorMsg(t.errorGeneric);
    } finally {
      setLoadingStage(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* Main scrollable content */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-3 sm:px-6 py-4 sm:py-6 space-y-4">
        {!isOnline && (
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs sm:text-sm font-medium text-amber-900 dark:text-amber-200">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>{t.offlineBanner}</span>
          </div>
        )}

        {docsCount === 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            {t.noDocsNotice}
          </div>
        )}

        {/* Loading Stage Banner */}
        {loadingStage && (
          <div className="flex items-center gap-3 rounded-2xl border border-sky-200 dark:border-sky-800/80 bg-sky-50/70 dark:bg-sky-950/30 px-4 py-3.5 text-sm font-medium text-sky-900 dark:text-sky-200">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
            <span>
              {loadingStage === 'searching' ? t.searchingStage : t.writingStage}
            </span>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div
            role="alert"
            className="rounded-2xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-200"
          >
            {errorMsg}
          </div>
        )}

        {/* Empty state / Example chips */}
        {!currentQA && !loadingStage && (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-8 space-y-5">
            <div className="max-w-2xl">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                {t.appNameFallback}
              </h1>
              <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                {t.tagline}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2.5">
                {t.examplesLabel}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {t.examples.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => void submitQuestion(q)}
                    className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 hover:border-sky-400 dark:hover:border-sky-600 px-4 py-3 min-h-[52px] text-sm text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Active Q&A */}
        {currentQA && (() => {
          const displayedAnswer =
            answerLang === currentQA.language
              ? currentQA.answer
              : currentQA.translations?.[answerLang] || currentQA.answer;
          const cachedLanguages: Language[] = [
            currentQA.language,
            ...((Object.keys(currentQA.translations || {}) as Language[]).filter(
              (l) => l !== currentQA.language
            )),
          ];

          return (
            <div ref={answerTopRef} className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/70 px-4 py-3">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {currentQA.question}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentQA(null)}
                  className="shrink-0 rounded-lg px-2.5 min-h-[36px] text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  {t.close}
                </button>
              </div>
              <AnswerView
                qaId={currentQA.id}
                question={currentQA.question}
                answer={displayedAnswer}
                answerLanguage={
                  answerLang === currentQA.language || currentQA.translations?.[answerLang]
                    ? answerLang
                    : currentQA.language
                }
                cachedLanguages={cachedLanguages}
                translatingLang={translatingLang}
                translateError={translateError}
                isOnline={isOnline}
                onTranslate={(lang) => void handleTranslateAnswer(lang)}
                reportUrl={reportUrl}
                dark={dark}
                t={t}
              />
            </div>
          );
        })()}

        {/* 3-language safety footer */}
        <footer className="pt-4 pb-2 text-center space-y-1">
          {SAFETY_FOOTER_ALL_LANGUAGES.map((line) => (
            <p
              key={line.lang}
              className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400"
            >
              <span className="font-semibold">{line.lang}:</span> {line.text}
            </p>
          ))}
        </footer>
      </main>

      {/* Ergonomic Bottom Thumb Composer */}
      <div className="sticky bottom-0 z-20 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md pb-safe pt-2.5 px-3 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitQuestion(input);
          }}
          className="mx-auto flex max-w-5xl items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.askPlaceholder}
            disabled={Boolean(loadingStage)}
            className="flex-1 min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />

          {speech.supported && (
            <button
              type="button"
              onClick={speech.toggle}
              aria-label={speech.listening ? t.micStop : t.micStart}
              title={speech.listening ? t.micStop : t.micStart}
              className={`inline-flex items-center justify-center min-h-[48px] min-w-[48px] rounded-xl border transition-colors shrink-0 ${
                speech.listening
                  ? 'border-red-500 bg-red-600 text-white'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {speech.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          )}

          <button
            type="submit"
            disabled={!input.trim() || Boolean(loadingStage) || !isOnline}
            className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors"
          >
            <Send className="h-4 w-4" />
            <span>{t.send}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
