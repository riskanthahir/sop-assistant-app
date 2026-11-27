import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Copy,
  CornerDownRight,
  ExternalLink,
  FileCheck2,
  FileText,
  Flag,
  GitBranch,
  HardHat,
  HelpCircle,
  Languages,
  Layers,
  ListOrdered,
  Loader2,
  LogOut,
  MessageCircle,
  RefreshCw,
  Share2,
  ShieldAlert,
  Sparkles,
  Table2,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import { LANGUAGE_OPTIONS, TRANSLATIONS } from '../i18n';
import type { UIStrings } from '../i18n/en';
import type { Language, StructuredAnswer } from '../types';
import { MermaidDiagram } from './MermaidDiagram';

interface AnswerViewProps {
  qaId: string;
  question: string;
  answer: StructuredAnswer;
  answerLanguage: Language;
  cachedLanguages: Language[];
  translatingLang: Language | null;
  translateError: string | null;
  isOnline: boolean;
  isLatest?: boolean;
  isBusy?: boolean;
  onTranslate: (lang: Language) => void;
  onAskFollowUp?: (questionText: string) => void;
  onRegenerate?: () => void;
  reportUrl: string;
  dark: boolean;
  t: UIStrings;
}

function sanitizeSafeHref(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Removes any inline chunk markers such as [C1], (C1, C2, C3), "chunks C1–C3",
 * or bare C1, C2 citations from displayed/copied prose.
 */
function cleanProse(text: string): string {
  const sep = '(?:\\s*(?:,\\s*(?:and|or)?|;|\\/|&|\\band\\b|\\bor\\b|\\bto\\b|–|—|-)\\s*)';
  const cTag = 'C\\d{1,2}';
  const cList = `${cTag}(?:${sep}(?:chunks?\\s*)?${cTag})*`;
  const cMulti = `${cTag}(?:${sep}(?:chunks?\\s*)?${cTag})+`;
  const leadPrep = '(?:(?:based\\s+on|from|in|per|see|using|ref)\\s+)?';

  return text
    .replace(new RegExp(`\\s*[\\[(]\\s*${leadPrep}(?:chunks?\\s*:?\\s*)?${cList}\\s*[\\])]`, 'gi'), '')
    .replace(new RegExp(`\\b${leadPrep}(?:chunks?\\s+)${cList}\\b`, 'gi'), '')
    .replace(new RegExp(`\\b${leadPrep}${cMulti}\\b`, 'gi'), '')
    .replace(/\b(?:based\s+on|from|per|see|ref)\s+C(?:[1-9]|1\d|2\d)\b/gi, '')
    .replace(/\s+\bC(?:[1-9]|1\d|2\d)\b(?=\s*[.,;:]|\s*$)/g, '')
    .replace(/\(\s*[,;:\-–—]*\s*\)/g, '')
    .replace(/\[\s*[,;:\-–—]*\s*\]/g, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/([.,;:])\s*,+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildSmartFollowUps(answer: StructuredAnswer, answerT: UIStrings): string[] {
  const modelSuggestions = (answer.follow_ups || [])
    .map((q) => cleanProse(q))
    .filter(Boolean)
    .slice(0, 3);
  if (modelSuggestions.length > 0) {
    return modelSuggestions;
  }

  if (answer.status === 'not_covered') return [];

  const fallbacks: string[] = [];
  if (answer.steps.length > 0) {
    const firstAction = cleanProse(answer.steps[0].action);
    fallbacks.push(
      answerT === TRANSLATIONS.si
        ? `පියවර 1 (${firstAction}) තවත් පැහැදිලි කරන්න`
        : answerT === TRANSLATIONS.ta
        ? `படி 1 (${firstAction}) பற்றி விரிவாக விளக்கவும்`
        : `Explain Step 1 (${firstAction}) in more detail`
    );
  }
  if (answer.materials_tools.length > 0) {
    fallbacks.push(
      answerT === TRANSLATIONS.si
        ? 'මෙම කාර්යය සඳහා අවශ්‍ය මෙවලම් සහ torque අගයන් මොනවාද?'
        : answerT === TRANSLATIONS.ta
        ? 'இதற்குத் தேவையான கருவிகள் மற்றும் torque அளவுகள் என்ன?'
        : 'What tools and torque values are required?'
    );
  }
  if (answer.quality_checks.length > 0) {
    fallbacks.push(
      answerT === TRANSLATIONS.si
        ? 'වැඩ අවසන් වූ පසු පරීක්ෂා කළ යුතු තත්ත්ව පරීක්ෂා මොනවාද?'
        : answerT === TRANSLATIONS.ta
        ? 'பணி முடிந்த பிறகு செய்ய வேண்டிய தரச் சோதனைகள் என்ன?'
        : 'What post-work quality checks must be verified?'
    );
  }
  return fallbacks.slice(0, 3);
}

function formatAnswerForPlainText(question: string, answer: StructuredAnswer, t: UIStrings): string {
  const lines: string[] = [];
  lines.push(cleanProse(answer.title));
  lines.push(`Q: ${question}`);
  lines.push('');

  if (answer.critical_warnings.length > 0) {
    lines.push(`${t.sections.criticalWarnings}:`);
    answer.critical_warnings.forEach((w) => lines.push(`• ${cleanProse(w.text)}`));
    lines.push('');
  }

  if (answer.scope_summary) {
    lines.push(cleanProse(answer.scope_summary.text));
    lines.push('');
  }

  if (answer.applies_to.length > 0) {
    lines.push(`${t.sections.appliesTo}:`);
    answer.applies_to.forEach((a) => lines.push(`• ${cleanProse(a.text)}`));
    lines.push('');
  }

  if (answer.prerequisites.length > 0) {
    lines.push(`${t.sections.prerequisites}:`);
    answer.prerequisites.forEach((p) => lines.push(`• ${cleanProse(p.text)}`));
    lines.push('');
  }

  if (answer.materials_tools.length > 0) {
    lines.push(`${t.sections.materialsTools}:`);
    answer.materials_tools.forEach((m) =>
      lines.push(
        `• ${cleanProse(m.item)}${m.spec_qty ? ` — ${cleanProse(m.spec_qty)}` : ''} (${m.type})`
      )
    );
    lines.push('');
  }

  if (answer.hazards_ppe.length > 0) {
    lines.push(`${t.sections.hazardsPpe}:`);
    answer.hazards_ppe.forEach((h) => lines.push(`• [${h.kind.toUpperCase()}] ${cleanProse(h.item)}`));
    lines.push('');
  }

  if (answer.steps.length > 0) {
    lines.push(`${t.sections.steps}:`);
    answer.steps.forEach((s, idx) => {
      const num = s.no || String(idx + 1);
      const lead = s.phase ? `${cleanProse(s.phase)} — ${cleanProse(s.action)}` : cleanProse(s.action);
      lines.push(`${num}. ${lead}`);
      if (s.details) lines.push(`   ${cleanProse(s.details)}`);
      if (s.caution) lines.push(`   • ${t.stepLabels.caution}: ${cleanProse(s.caution)}`);
      if (s.check) lines.push(`   • ${t.stepLabels.verify}: ${cleanProse(s.check)}`);
    });
    lines.push('');
  }

  if (answer.quality_checks.length > 0) {
    lines.push(`${t.sections.qualityChecks}:`);
    answer.quality_checks.forEach((q) =>
      lines.push(`• ${cleanProse(q.check)}${q.criteria ? ` — ${cleanProse(q.criteria)}` : ''}`)
    );
    lines.push('');
  }

  if (answer.site_cleanup.length > 0) {
    lines.push(`${t.sections.siteCleanup}:`);
    answer.site_cleanup.forEach((item) => lines.push(`• ${cleanProse(item.text)}`));
    lines.push('');
  }

  if (answer.exit_handover.length > 0) {
    lines.push(`${t.sections.exitHandover}:`);
    answer.exit_handover.forEach((item) => lines.push(`• ${cleanProse(item.text)}`));
    lines.push('');
  }

  if (answer.records_reporting.length > 0) {
    lines.push(`${t.sections.recordsReporting}:`);
    answer.records_reporting.forEach((item) => lines.push(`• ${cleanProse(item.text)}`));
    lines.push('');
  }

  if (answer.not_specified.length > 0) {
    lines.push(`${t.sections.notSpecified}:`);
    answer.not_specified.forEach((item) => lines.push(`• ${cleanProse(item)}`));
    lines.push('');
  }

  if (answer.conflicts.length > 0) {
    lines.push(`${t.sections.conflicts}:`);
    answer.conflicts.forEach((item) => lines.push(`• ${cleanProse(item)}`));
    lines.push('');
  }

  if (answer.references.length > 0) {
    lines.push(`${t.sections.references}:`);
    answer.references.forEach((r) =>
      lines.push(`• ${r.document} (${r.revision}) · ${r.chapter} · ${r.pages}`)
    );
  }

  return lines.join('\n');
}

interface BulletSectionProps {
  title: string;
  icon?: React.ReactNode;
  items: string[];
}

const BulletSection: React.FC<BulletSectionProps> = ({ title, icon, items }) => {
  if (items.length === 0) return null;
  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        {icon && <span className="shrink-0 text-sky-600 dark:text-sky-400">{icon}</span>}
        <span>{title}</span>
      </h3>
      <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-200 leading-relaxed marker:text-slate-400 dark:marker:text-slate-500">
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    </section>
  );
};

export const AnswerView: React.FC<AnswerViewProps> = ({
  qaId,
  question,
  answer,
  answerLanguage,
  cachedLanguages,
  translatingLang,
  translateError,
  isOnline,
  isLatest = false,
  isBusy = false,
  onTranslate,
  onAskFollowUp,
  onRegenerate,
  reportUrl,
  dark,
  t,
}) => {
  const [quickView, setQuickView] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFlowchart, setShowFlowchart] = useState(false);
  const [flowchartFailed, setFlowchartFailed] = useState(false);
  const [focusedStepIdx, setFocusedStepIdx] = useState<number | null>(null);

  const answerT = TRANSLATIONS[answerLanguage];

  useEffect(() => {
    setFlowchartFailed(false);
    setFocusedStepIdx(null);
  }, [qaId, answerLanguage]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatAnswerForPlainText(question, answer, answerT));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    const text = formatAnswerForPlainText(question, answer, answerT);
    if (navigator.share) {
      try {
        await navigator.share({
          title: cleanProse(answer.title),
          text,
        });
        return;
      } catch {
        // fallback to copy
      }
    }
    await handleCopy();
  };

  const handleFlowchartFailed = useCallback(() => {
    setFlowchartFailed(true);
  }, []);

  const safeReportHref = sanitizeSafeHref(reportUrl);
  const followUpChips = buildSmartFollowUps(answer, answerT);

  const statusConfig =
    answer.status === 'answered'
      ? {
          label: answerT.statusAnswered,
          icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
          textClass: 'text-emerald-700 dark:text-emerald-400',
        }
      : answer.status === 'partially_covered'
      ? {
          label: answerT.statusPartial,
          icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
          textClass: 'text-amber-700 dark:text-amber-400',
        }
      : {
          label: answerT.statusNotCovered,
          icon: <HelpCircle className="h-4 w-4 text-slate-500 dark:text-slate-400" />,
          textClass: 'text-slate-600 dark:text-slate-300',
        };

  return (
    <article className="rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-5 space-y-3.5 sm:space-y-4 shadow-2xs overflow-hidden">
      {/* Header & Interactive Controls */}
      <header className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {statusConfig.icon}
            <span className={statusConfig.textClass}>{statusConfig.label}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick / Full icon toggle */}
            <div className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setQuickView(false)}
                aria-label={t.fullView}
                title={t.fullView}
                aria-pressed={!quickView}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                  !quickView
                    ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setQuickView(true)}
                aria-label={t.quickView}
                title={t.quickView}
                aria-pressed={quickView}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                  quickView
                    ? 'bg-white dark:bg-slate-950 text-sky-700 dark:text-sky-400 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
              </button>
            </div>

            {isLatest && onRegenerate && (
              <button
                type="button"
                disabled={isBusy || !isOnline}
                onClick={onRegenerate}
                aria-label={t.regenerate}
                title={t.regenerate}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-sky-700 dark:hover:text-sky-400 disabled:opacity-45 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleCopy()}
              aria-label={copied ? t.copied : t.copy}
              title={copied ? t.copied : t.copy}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-sky-700 dark:hover:text-sky-400 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => void handleShare()}
              aria-label={t.share}
              title={t.share}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-sky-700 dark:hover:text-sky-400 transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>

            {safeReportHref && (
              <a
                href={safeReportHref}
                target={safeReportHref.startsWith('http') ? '_blank' : undefined}
                rel={safeReportHref.startsWith('http') ? 'noopener noreferrer' : undefined}
                aria-label={t.reportProblem}
                title={t.reportProblem}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
              >
                <Flag className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
          {cleanProse(answer.title)}
        </h2>

        {/* Translate Bar with circular first-letter buttons */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"
            aria-label={translatingLang ? t.translating : t.translateLabel}
            title={translatingLang ? t.translating : t.translateLabel}
          >
            {translatingLang ? (
              <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />
            ) : (
              <Languages className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            )}
            {translatingLang && <span className="text-[11px]">{t.translating}</span>}
          </div>

          <div
            role="group"
            aria-label={t.translateLabel}
            className="flex items-center gap-1.5 shrink-0"
          >
            {LANGUAGE_OPTIONS.map((opt) => {
              const active = answerLanguage === opt.code;
              const isCached = cachedLanguages.includes(opt.code);
              const isThisTranslating = translatingLang === opt.code;
              const disabled = Boolean(translatingLang) || (!isOnline && !isCached);
              return (
                <button
                  key={opt.code}
                  type="button"
                  disabled={disabled}
                  onClick={() => onTranslate(opt.code)}
                  aria-label={`${t.translateLabel}: ${opt.label}`}
                  title={`${t.translateLabel}: ${opt.label}`}
                  aria-pressed={active}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold leading-none shrink-0 border transition-colors disabled:opacity-45 ${
                    active
                      ? 'border-sky-600 bg-sky-600 text-white shadow-xs dark:border-sky-500 dark:bg-sky-500'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-sky-400 hover:text-sky-700 dark:hover:text-sky-300'
                  }`}
                >
                  {isThisTranslating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    opt.shortLabel
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {translateError && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-300">
            {translateError}
          </p>
        )}
      </header>

      {/* Mini Structured Paragraph Overview */}
      {answer.scope_summary && (
        <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
          {cleanProse(answer.scope_summary.text)}
        </p>
      )}

      {/* Critical Warnings */}
      {answer.critical_warnings.length > 0 && (
        <section
          aria-label={answerT.sections.criticalWarnings}
          className="rounded-xl border border-red-200 dark:border-red-900/80 bg-red-50/80 dark:bg-red-950/35 px-3.5 py-3 space-y-1.5"
        >
          <div className="flex items-center gap-1.5 text-red-800 dark:text-red-300 text-xs font-bold uppercase tracking-wide">
            <AlertOctagon className="h-4 w-4 shrink-0" />
            <span>{answerT.sections.criticalWarnings}</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-red-950 dark:text-red-100 leading-relaxed">
            {answer.critical_warnings.map((w, i) => (
              <li key={i}>{cleanProse(w.text)}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Supporting Bulleted Preparation Context (Full view) */}
      {!quickView && (
        <>
          <BulletSection
            title={answerT.sections.appliesTo}
            icon={<Users className="h-3.5 w-3.5" />}
            items={answer.applies_to.map((item) => cleanProse(item.text))}
          />

          <BulletSection
            title={answerT.sections.prerequisites}
            icon={<FileCheck2 className="h-3.5 w-3.5" />}
            items={answer.prerequisites.map((item) => cleanProse(item.text))}
          />

          <BulletSection
            title={answerT.sections.materialsTools}
            icon={<Wrench className="h-3.5 w-3.5" />}
            items={answer.materials_tools.map(
              (m) =>
                `${cleanProse(m.item)}${m.spec_qty ? ` — ${cleanProse(m.spec_qty)}` : ''} (${m.type})`
            )}
          />

          <BulletSection
            title={answerT.sections.hazardsPpe}
            icon={<HardHat className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
            items={answer.hazards_ppe.map(
              (h) => `${h.kind.toUpperCase()}: ${cleanProse(h.item)}`
            )}
          />
        </>
      )}

      {/* Procedure Steps (Interactive numbered list, NO checklists) */}
      {answer.steps.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            <ListOrdered className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            <span>{answerT.sections.steps}</span>
          </h3>
          <ol className="list-decimal pl-5 space-y-2.5 text-sm text-slate-800 dark:text-slate-200 leading-relaxed marker:font-semibold marker:text-sky-700 dark:marker:text-sky-400">
            {answer.steps.map((step, idx) => {
              const isFocused = focusedStepIdx === idx;
              const cleanAction = cleanProse(step.action);
              const cleanPhase = cleanProse(step.phase);
              const stepFollowUpQuery =
                answerLanguage === 'si'
                  ? `පියවර ${step.no || idx + 1} (${cleanAction}) පිළිබඳව තවත් විස්තර පැහැදිලි කරන්න`
                  : answerLanguage === 'ta'
                  ? `படி ${step.no || idx + 1} (${cleanAction}) பற்றி மேலும் விரிவாக விளக்கவும்`
                  : `Explain step ${step.no || idx + 1} (${cleanAction}) in more detail`;

              return (
                <li
                  key={`${idx}_${step.no}`}
                  onClick={() => setFocusedStepIdx((prev) => (prev === idx ? null : idx))}
                  className={`pl-1.5 rounded-lg py-1.5 pr-2 transition-colors cursor-pointer ${
                    isFocused
                      ? 'bg-sky-50/80 dark:bg-sky-950/30 ring-1 ring-sky-200 dark:ring-sky-800/70'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {cleanPhase ? `${cleanPhase} — ` : ''}
                      {cleanAction}
                    </span>
                  </div>

                  {step.details && (
                    <p className="mt-1 text-slate-700 dark:text-slate-300 leading-relaxed">
                      {cleanProse(step.details)}
                    </p>
                  )}

                  {(step.caution || step.check) && (
                    <ul className="mt-1.5 list-disc pl-5 space-y-1 text-xs sm:text-[13px]">
                      {step.caution && (
                        <li className="text-amber-800 dark:text-amber-300">
                          <span className="font-semibold">{answerT.stepLabels.caution}:</span>{' '}
                          {cleanProse(step.caution)}
                        </li>
                      )}
                      {step.check && (
                        <li className="text-sky-800 dark:text-sky-300">
                          <span className="font-semibold">{answerT.stepLabels.verify}:</span>{' '}
                          {cleanProse(step.check)}
                        </li>
                      )}
                    </ul>
                  )}

                  {isFocused && onAskFollowUp && isOnline && (
                    <div className="mt-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAskFollowUp(stepFollowUpQuery);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 dark:border-sky-700 bg-white dark:bg-slate-900 hover:bg-sky-50 dark:hover:bg-sky-950/50 disabled:opacity-50 px-2.5 min-h-[32px] text-xs font-medium text-sky-700 dark:text-sky-300 transition-colors"
                      >
                        <CornerDownRight className="h-3 w-3" />
                        <span>{t.askAboutStep}</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Tables (Full view, no Src column) */}
      {!quickView && answer.tables.length > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            <Table2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            <span>{answerT.sections.tables}</span>
          </h3>
          {answer.tables.map((tbl, tIdx) => (
            <div key={tIdx} className="space-y-1.5">
              {tbl.title && (
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {cleanProse(tbl.title)}
                </p>
              )}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[340px] text-left text-xs sm:text-sm border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-950/60">
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      {tbl.headers.map((h, hIdx) => (
                        <th
                          key={hIdx}
                          className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap"
                        >
                          {cleanProse(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {tbl.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="px-3 py-2 text-slate-700 dark:text-slate-200 tabular-nums"
                          >
                            {cleanProse(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Optional Flowchart Toggle (Full view) */}
      {!quickView && answer.flowchart && !flowchartFailed && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setShowFlowchart((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 min-h-[34px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <GitBranch className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            <span>{answerT.sections.flowchart}</span>
            {showFlowchart ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showFlowchart && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-950/40">
              <MermaidDiagram
                flowchart={answer.flowchart}
                dark={dark}
                onRenderFailed={handleFlowchartFailed}
              />
            </div>
          )}
        </section>
      )}

      {/* Post-work & Wrap-up Bullets (Full view) */}
      {!quickView && (
        <>
          <BulletSection
            title={answerT.sections.qualityChecks}
            icon={<ClipboardCheck className="h-3.5 w-3.5" />}
            items={answer.quality_checks.map(
              (qc) => `${cleanProse(qc.check)}${qc.criteria ? ` — ${cleanProse(qc.criteria)}` : ''}`
            )}
          />

          <BulletSection
            title={answerT.sections.siteCleanup}
            icon={<Sparkles className="h-3.5 w-3.5" />}
            items={answer.site_cleanup.map((item) => cleanProse(item.text))}
          />

          <BulletSection
            title={answerT.sections.exitHandover}
            icon={<LogOut className="h-3.5 w-3.5" />}
            items={answer.exit_handover.map((item) => cleanProse(item.text))}
          />

          <BulletSection
            title={answerT.sections.recordsReporting}
            icon={<FileText className="h-3.5 w-3.5" />}
            items={answer.records_reporting.map((item) => cleanProse(item.text))}
          />

          <BulletSection
            title={answerT.sections.relatedSops}
            icon={<Layers className="h-3.5 w-3.5" />}
            items={answer.related_sops.map((item) => cleanProse(item))}
          />
        </>
      )}

      {/* Not Specified & Conflicts */}
      <BulletSection
        title={answerT.sections.notSpecified}
        icon={<HelpCircle className="h-3.5 w-3.5 text-slate-400" />}
        items={answer.not_specified.map((item) => cleanProse(item))}
      />

      {answer.conflicts.length > 0 && (
        <section className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 px-3.5 py-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 text-xs font-bold uppercase tracking-wide">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{answerT.sections.conflicts}</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-amber-950 dark:text-amber-100 leading-relaxed">
            {answer.conflicts.map((item, idx) => (
              <li key={idx}>{cleanProse(item)}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Interactive Follow-Up Prompts (Shown on latest turn) */}
      {isLatest && onAskFollowUp && isOnline && followUpChips.length > 0 && (
        <section className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <MessageCircle className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            <span>{t.followUpsLabel}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {followUpChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isBusy}
                onClick={() => onAskFollowUp(chip)}
                className="text-left rounded-xl border border-sky-200 dark:border-sky-800/80 bg-sky-50/70 dark:bg-sky-950/30 hover:bg-sky-100/80 dark:hover:bg-sky-900/40 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-sky-900 dark:text-sky-200 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* SOP References Footer */}
      {answer.references.length > 0 && (
        <footer className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <BookOpen className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            <span>{answerT.sections.references}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {answer.references.map((ref, idx) => {
              const safeUrl = sanitizeSafeHref(ref.driveUrl);
              const content = (
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <span>{ref.document}</span>
                    {safeUrl && <ExternalLink className="h-3 w-3 text-sky-600 dark:text-sky-400 shrink-0" />}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {ref.revision} · {ref.chapter} · {ref.pages}
                  </span>
                </div>
              );

              if (safeUrl) {
                return (
                  <a
                    key={idx}
                    href={safeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 hover:border-sky-400 dark:hover:border-sky-600 px-3 py-1.5 transition-colors"
                  >
                    {content}
                  </a>
                );
              }

              return (
                <div
                  key={idx}
                  className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-3 py-1.5"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </footer>
      )}
    </article>
  );
};
