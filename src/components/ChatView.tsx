import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, MessageSquarePlus, Mic, MicOff, Send, WifiOff } from 'lucide-react';
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
  thread: SavedQA[];
  onSaveQA: (qa: SavedQA) => void;
  onNewChat: () => void;
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
  thread,
  onSaveQA,
  onNewChat,
  onUnauthorized,
  t,
}) => {
  const [input, setInput] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState<'searching' | 'writing' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [answerLangById, setAnswerLangById] = useState<Record<string, Language>>({});
  const [translatingById, setTranslatingById] = useState<Record<string, Language | null>>({});
  const [translateErrorById, setTranslateErrorById] = useState<Record<string, string | null>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (thread.length > 0 || pendingQuestion || loadingStage) {
      const timer = setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [thread.length, pendingQuestion, loadingStage]);

  const speech = useSpeechInput(language, (transcript) => {
    setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
  });

  const handleTranslateAnswer = async (qa: SavedQA, targetLang: Language) => {
    if (translatingById[qa.id]) return;
    setTranslateErrorById((prev) => ({ ...prev, [qa.id]: null }));

    if (targetLang === qa.language || qa.translations?.[targetLang]) {
      setAnswerLangById((prev) => ({ ...prev, [qa.id]: targetLang }));
      return;
    }

    if (!isOnline) {
      setTranslateErrorById((prev) => ({ ...prev, [qa.id]: t.offlineBanner }));
      return;
    }

    setTranslatingById((prev) => ({ ...prev, [qa.id]: targetLang }));
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-code': accessCode,
        },
        body: JSON.stringify({
          answer: qa.answer,
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
        setTranslateErrorById((prev) => ({ ...prev, [qa.id]: msg }));
        return;
      }

      const data = (await response.json()) as { answer?: SavedQA['answer'] };
      if (!data.answer) {
        setTranslateErrorById((prev) => ({ ...prev, [qa.id]: t.translateError }));
        return;
      }

      const updatedQA: SavedQA = {
        ...qa,
        translations: {
          ...(qa.translations || {}),
          [targetLang]: data.answer,
        },
      };
      setAnswerLangById((prev) => ({ ...prev, [qa.id]: targetLang }));
      onSaveQA(updatedQA);
    } catch {
      setTranslateErrorById((prev) => ({ ...prev, [qa.id]: t.translateError }));
    } finally {
      setTranslatingById((prev) => ({ ...prev, [qa.id]: null }));
    }
  };

  const submitQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loadingStage) return;

    if (!isOnline) {
      setErrorMsg(t.offlineBanner);
      return;
    }

    const previousQuestion = thread[thread.length - 1]?.question || '';
    const conversationHistory = thread.slice(-4).map((item) => ({
      question: item.question,
      title: item.answer.title,
      summary: item.answer.scope_summary?.text || '',
    }));

    setErrorMsg(null);
    setPendingQuestion(trimmed);
    setInput('');
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
          previousQuestion,
          conversationHistory,
          language,
        }),
      });

      if (response.status === 401) {
        setPendingQuestion(null);
        setLoadingStage(null);
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
        setPendingQuestion(null);
        setInput((prev) => prev || trimmed);
        setLoadingStage(null);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleEvent = (event: ChatStreamEvent) => {
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
          setPendingQuestion(null);
          setAnswerLangById((prev) => ({ ...prev, [saved.id]: language }));
          onSaveQA(saved);
        } else if (event.type === 'error') {
          setErrorMsg(event.error || t.errorGeneric);
          setPendingQuestion(null);
          setLoadingStage(null);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const clean = line.trim();
          if (!clean) continue;
          handleEvent(JSON.parse(clean) as ChatStreamEvent);
        }
      }

      if (buffer.trim()) {
        handleEvent(JSON.parse(buffer.trim()) as ChatStreamEvent);
      }
    } catch {
      setErrorMsg(t.errorGeneric);
      setPendingQuestion(null);
      setInput((prev) => prev || trimmed);
    } finally {
      setLoadingStage(null);
      setPendingQuestion(null);
    }
  };

  const hasConversation = thread.length > 0 || Boolean(pendingQuestion);

  return (
    <div className="flex flex-1 flex-col">
      {/* Main scrollable conversation area */}
      <main className="flex-1 mx-auto w-full max-w-4xl px-3 sm:px-6 py-4 sm:py-6 flex flex-col gap-4">
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

        {/* Active conversation header */}
        {hasConversation && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              disabled={Boolean(loadingStage)}
              onClick={() => {
                setErrorMsg(null);
                setPendingQuestion(null);
                onNewChat();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 px-3 min-h-[38px] text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
            >
              <MessageSquarePlus className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span>{t.newChat}</span>
            </button>
          </div>
        )}

        {/* Empty state / Example prompts */}
        {!hasConversation && (
          <section className="my-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-8 space-y-5">
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

        {/* Chronological Chat Timeline */}
        {hasConversation && (
          <div className="space-y-6">
            {thread.map((qa) => {
              const selectedLang = answerLangById[qa.id] ?? qa.language;
              const effectiveLang =
                selectedLang === qa.language || qa.translations?.[selectedLang]
                  ? selectedLang
                  : qa.language;
              const displayedAnswer =
                effectiveLang === qa.language
                  ? qa.answer
                  : qa.translations?.[effectiveLang] || qa.answer;
              const cachedLanguages: Language[] = [
                qa.language,
                ...((Object.keys(qa.translations || {}) as Language[]).filter(
                  (l) => l !== qa.language
                )),
              ];

              return (
                <div key={qa.id} className="space-y-3">
                  {/* User message bubble */}
                  <div className="flex justify-end">
                    <div className="max-w-[88%] sm:max-w-xl rounded-2xl rounded-tr-sm bg-sky-600 px-4 py-2.5 text-sm sm:text-[15px] text-white shadow-xs">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-100/90 mb-0.5">
                        {t.youLabel}
                      </p>
                      <p className="leading-relaxed">{qa.question}</p>
                    </div>
                  </div>

                  {/* Assistant message bubble */}
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <div
                      aria-hidden="true"
                      className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 mt-0.5"
                    >
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1 sm:hidden">
                        {t.assistantLabel}
                      </p>
                      <AnswerView
                        qaId={qa.id}
                        question={qa.question}
                        answer={displayedAnswer}
                        answerLanguage={effectiveLang}
                        cachedLanguages={cachedLanguages}
                        translatingLang={translatingById[qa.id] ?? null}
                        translateError={translateErrorById[qa.id] ?? null}
                        isOnline={isOnline}
                        onTranslate={(lang) => void handleTranslateAnswer(qa, lang)}
                        reportUrl={reportUrl}
                        dark={dark}
                        t={t}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pending current turn */}
            {pendingQuestion && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[88%] sm:max-w-xl rounded-2xl rounded-tr-sm bg-sky-600 px-4 py-2.5 text-sm sm:text-[15px] text-white shadow-xs">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-100/90 mb-0.5">
                      {t.youLabel}
                    </p>
                    <p className="leading-relaxed">{pendingQuestion}</p>
                  </div>
                </div>

                {loadingStage && (
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <div
                      aria-hidden="true"
                      className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 mt-0.5"
                    >
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="inline-flex items-center gap-3 rounded-2xl rounded-tl-sm border border-sky-200 dark:border-sky-800/80 bg-sky-50/70 dark:bg-sky-950/30 px-4 py-3 text-sm font-medium text-sky-900 dark:text-sky-200">
                      <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
                      <span>
                        {loadingStage === 'searching' ? t.searchingStage : t.writingStage}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
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

        <div ref={bottomRef} />

        {/* 3-language safety footer */}
        <footer className="pt-2 pb-1 text-center space-y-1">
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
          className="mx-auto flex max-w-4xl items-center gap-2"
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
