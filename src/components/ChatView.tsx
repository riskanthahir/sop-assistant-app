import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  Bot,
  ClipboardCheck,
  Languages,
  Layers,
  ListOrdered,
  MessageSquarePlus,
  Mic,
  MicOff,
  Radio,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  WifiOff,
  Wrench,
} from 'lucide-react';
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

function formatMessageTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const SEARCH_STAGE_ICONS = [Search, ShieldCheck, Layers, Wrench];
const WRITE_STAGE_ICONS = [Wrench, ListOrdered, ClipboardCheck, Sparkles];

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
  const [stageTick, setStageTick] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [answerLangById, setAnswerLangById] = useState<Record<string, Language>>({});
  const [translatingById, setTranslatingById] = useState<Record<string, Language | null>>({});
  const [translateErrorById, setTranslateErrorById] = useState<Record<string, string | null>>({});
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const answerStartRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingScrollAnswerIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  useEffect(() => {
    const targetAnswerId = pendingScrollAnswerIdRef.current;
    if (targetAnswerId) {
      const targetEl = answerStartRefs.current.get(targetAnswerId);
      if (targetEl) {
        const timer = setTimeout(() => {
          pendingScrollAnswerIdRef.current = null;
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
        return () => clearTimeout(timer);
      }
    }

    if (pendingQuestion || loadingStage) {
      const timer = setTimeout(() => scrollToBottom('smooth'), 60);
      return () => clearTimeout(timer);
    }
  }, [thread.length, pendingQuestion, loadingStage]);

  useEffect(() => {
    if (!loadingStage) {
      setStageTick(0);
      return;
    }
    setStageTick(0);
    const interval = setInterval(() => {
      setStageTick((prev) => prev + 1);
    }, 2200);
    return () => clearInterval(interval);
  }, [loadingStage]);

  useEffect(() => {
    const onScroll = () => {
      const distanceFromBottom =
        document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      setShowScrollBottom(distanceFromBottom > 280 && thread.length > 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [thread.length]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 124)}px`;
  }, [input]);

  const speech = useSpeechInput(language, (transcript) => {
    setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
  });

  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoadingStage(null);
    setPendingQuestion(null);
  };

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

    const controller = new AbortController();
    abortControllerRef.current = controller;

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
        signal: controller.signal,
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
          pendingScrollAnswerIdRef.current = saved.id;
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
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setInput((prev) => prev || trimmed);
      } else {
        setErrorMsg(t.errorGeneric);
        setInput((prev) => prev || trimmed);
      }
      setPendingQuestion(null);
    } finally {
      abortControllerRef.current = null;
      setLoadingStage(null);
      setPendingQuestion(null);
    }
  };

  const hasConversation = thread.length > 0 || Boolean(pendingQuestion);

  const activeStageMessages =
    loadingStage === 'writing' ? t.writingStages : t.searchingStages;
  const activeStageIcons =
    loadingStage === 'writing' ? WRITE_STAGE_ICONS : SEARCH_STAGE_ICONS;
  const currentMessage =
    activeStageMessages[stageTick % activeStageMessages.length] ||
    (loadingStage === 'writing' ? t.writingStage : t.searchingStage);
  const StageIcon = activeStageIcons[stageTick % activeStageIcons.length] || Search;

  const singleSafetyLine =
    SAFETY_FOOTER_ALL_LANGUAGES.find(
      (line) =>
        (language === 'si' && line.lang === 'සිංහල') ||
        (language === 'ta' && line.lang === 'தமிழ்') ||
        (language === 'en' && line.lang === 'EN')
    ) || SAFETY_FOOTER_ALL_LANGUAGES[0];

  const heroFeatureIcons = [ShieldCheck, ListOrdered, Languages];

  return (
    <div className="flex flex-1 flex-col relative overflow-x-clip">
      {/* Main scrollable conversation area */}
      <main className="flex-1 mx-auto w-full max-w-4xl px-2.5 sm:px-6 py-3 sm:py-5 flex flex-col gap-3.5 sm:gap-4 min-w-0">
        {!isOnline && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-amber-900 dark:text-amber-200">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>{t.offlineBanner}</span>
          </div>
        )}

        {docsCount === 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            {t.noDocsNotice}
          </div>
        )}

        {/* Active conversation header bar */}
        {hasConversation && (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Radio className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span>{t.assistantLabel}</span>
            </span>
            <button
              type="button"
              disabled={Boolean(loadingStage)}
              onClick={() => {
                setErrorMsg(null);
                setPendingQuestion(null);
                onNewChat();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 px-3 min-h-[36px] text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
            >
              <MessageSquarePlus className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span>{t.newChat}</span>
            </button>
          </div>
        )}

        {/* Mobile-optimized welcome state with field vector graphic (no common field questions) */}
        {!hasConversation && (
          <section className="my-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-7 space-y-5 shadow-2xs">
            <div className="flex items-start gap-3.5 sm:gap-5">
              {/* Custom telecom SOP field graphic */}
              <div
                aria-hidden="true"
                className="flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm"
              >
                <svg
                  viewBox="0 0 48 48"
                  className="h-9 w-9 sm:h-10 sm:w-10"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M24 12V36M17 36H31M19 28L29 22M19 22L29 28"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="24" cy="11" r="2.5" fill="currentColor" />
                  <path
                    d="M15.5 16.5C13 13 13 9 15.5 6M32.5 16.5C35 13 35 9 32.5 6"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    opacity="0.85"
                  />
                  <path
                    d="M11 20C7.5 15 7.5 8 11 3.5M37 20C40.5 15 40.5 8 37 3.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity="0.5"
                  />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                  {t.appNameFallback}
                </h1>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t.tagline}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              {t.heroFeatures.map((feat, idx) => {
                const Icon = heroFeatureIcons[idx] || ShieldCheck;
                return (
                  <div
                    key={idx}
                    className="flex items-center sm:items-start gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 px-3.5 py-2.5 sm:p-3.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {feat.title}
                      </p>
                      <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-snug">
                        {feat.subtitle}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Chronological Interactive Chat Timeline */}
        {hasConversation && (
          <div className="space-y-4 sm:space-y-6">
            {thread.map((qa, idx) => {
              const isLatest = idx === thread.length - 1 && !pendingQuestion;
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
              const timeLabel = formatMessageTime(qa.createdAt);

              return (
                <div key={qa.id} className="space-y-2.5 sm:space-y-3">
                  {/* User message bubble */}
                  <div className="flex justify-end">
                    <div className="max-w-[92%] sm:max-w-xl rounded-2xl rounded-tr-sm bg-sky-600 px-3.5 sm:px-4 py-2.5 text-sm sm:text-[15px] text-white shadow-xs">
                      <div className="flex items-center justify-between gap-3 mb-0.5">
                        <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-sky-100/90">
                          {t.youLabel}
                        </span>
                        {timeLabel && (
                          <span className="text-[10px] text-sky-100/75 tabular-nums">
                            {timeLabel}
                          </span>
                        )}
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap break-words">
                        {qa.question}
                      </p>
                    </div>
                  </div>

                  {/* Assistant message bubble */}
                  <div
                    ref={(el) => {
                      if (el) {
                        answerStartRefs.current.set(qa.id, el);
                      } else {
                        answerStartRefs.current.delete(qa.id);
                      }
                    }}
                    className="flex items-start gap-2 sm:gap-3 scroll-mt-[72px]"
                  >
                    <div
                      aria-hidden="true"
                      className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 mt-0.5"
                    >
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1 sm:hidden">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <Bot className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                          <span>{t.assistantLabel}</span>
                        </span>
                        {timeLabel && (
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            {timeLabel}
                          </span>
                        )}
                      </div>
                      <AnswerView
                        qaId={qa.id}
                        question={qa.question}
                        answer={displayedAnswer}
                        answerLanguage={effectiveLang}
                        cachedLanguages={cachedLanguages}
                        translatingLang={translatingById[qa.id] ?? null}
                        translateError={translateErrorById[qa.id] ?? null}
                        isOnline={isOnline}
                        isLatest={isLatest}
                        isBusy={Boolean(loadingStage)}
                        onTranslate={(lang) => void handleTranslateAnswer(qa, lang)}
                        onAskFollowUp={(followUp) => void submitQuestion(followUp)}
                        onRegenerate={() => void submitQuestion(qa.question)}
                        reportUrl={reportUrl}
                        dark={dark}
                        t={t}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pending current turn with rich engaging multi-stage graphics */}
            {pendingQuestion && (
              <div className="space-y-2.5 sm:space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[92%] sm:max-w-xl rounded-2xl rounded-tr-sm bg-sky-600 px-3.5 sm:px-4 py-2.5 text-sm sm:text-[15px] text-white shadow-xs">
                    <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-sky-100/90 mb-0.5">
                      {t.youLabel}
                    </p>
                    <p className="leading-relaxed whitespace-pre-wrap break-words">
                      {pendingQuestion}
                    </p>
                  </div>
                </div>

                {loadingStage && (
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div
                      aria-hidden="true"
                      className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 mt-0.5"
                    >
                      <Bot className="h-4 w-4 animate-pulse" />
                    </div>
                    <div className="w-full sm:max-w-md rounded-2xl rounded-tl-sm border border-sky-200 dark:border-sky-800/80 bg-gradient-to-br from-sky-50/90 to-white dark:from-sky-950/40 dark:to-slate-900 p-3.5 sm:p-4 space-y-3 shadow-2xs">
                      <div className="flex items-center gap-3">
                        {/* Animated SOP pulse graphic */}
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-xs">
                          <span className="absolute inline-flex h-full w-full rounded-xl bg-sky-400 opacity-30 animate-ping" />
                          <StageIcon className="relative h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                              {loadingStage === 'searching' ? 'SOP Search' : 'Guideline Builder'}
                            </span>
                            <span className="inline-flex gap-0.5 items-center">
                              <span className="h-1 w-1 rounded-full bg-sky-500 animate-bounce [animation-delay:-0.2s]" />
                              <span className="h-1 w-1 rounded-full bg-sky-500 animate-bounce [animation-delay:-0.1s]" />
                              <span className="h-1 w-1 rounded-full bg-sky-500 animate-bounce" />
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug">
                            {currentMessage}
                          </p>
                        </div>
                      </div>

                      {/* Subtle interactive phase progress indicators */}
                      <div className="flex items-center gap-1.5">
                        {activeStageMessages.map((_, idx) => {
                          const active = idx === stageTick % activeStageMessages.length;
                          const done = idx < stageTick % activeStageMessages.length;
                          return (
                            <span
                              key={idx}
                              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                                active
                                  ? 'bg-sky-600 dark:bg-sky-400'
                                  : done
                                  ? 'bg-sky-300 dark:bg-sky-700'
                                  : 'bg-slate-200 dark:bg-slate-800'
                              }`}
                            />
                          );
                        })}
                      </div>
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

        {/* Single-line safety footer (removed 2nd and 3rd paragraphs) */}
        <footer className="pt-1 pb-1 text-center">
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">{singleSafetyLine.lang}:</span> {singleSafetyLine.text}
          </p>
        </footer>
      </main>

      {/* Jump to latest reply floating pill */}
      {showScrollBottom && (
        <div className="sticky bottom-[76px] z-10 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-md px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 backdrop-blur-sm"
          >
            <ArrowDown className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            <span>{t.scrollToBottom}</span>
          </button>
        </div>
      )}

      {/* Ergonomic Mobile-First Multi-Line Bottom Composer */}
      <div className="sticky bottom-0 z-20 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md pb-safe pt-2 px-2.5 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitQuestion(input);
          }}
          className="mx-auto flex max-w-4xl items-end gap-1.5 sm:gap-2"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !loadingStage && isOnline) {
                  void submitQuestion(input);
                }
              }
            }}
            placeholder={t.askPlaceholder}
            disabled={Boolean(loadingStage)}
            className="flex-1 min-h-[46px] max-h-[124px] resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 leading-snug"
          />

          {speech.supported && (
            <button
              type="button"
              onClick={speech.toggle}
              disabled={Boolean(loadingStage)}
              aria-label={speech.listening ? t.micStop : t.micStart}
              title={speech.listening ? t.micStop : t.micStart}
              className={`inline-flex items-center justify-center min-h-[46px] min-w-[44px] sm:min-w-[48px] rounded-xl border transition-colors shrink-0 disabled:opacity-50 ${
                speech.listening
                  ? 'border-red-500 bg-red-600 text-white'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {speech.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          )}

          {loadingStage ? (
            <button
              type="button"
              onClick={handleStopGenerating}
              className="inline-flex items-center justify-center gap-1.5 min-h-[46px] px-3 sm:px-4 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>{t.stopGenerating}</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !isOnline}
              className="inline-flex items-center justify-center gap-1.5 min-h-[46px] px-3.5 sm:px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              <Send className="h-4 w-4" />
              <span>{t.send}</span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
