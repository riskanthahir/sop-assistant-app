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
  Share2,
  ShieldAlert,
  Sparkles,
  Table2,
  Target,
  Users,
  Wrench,
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
  onTranslate: (lang: Language) => void;
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

interface CollapsibleCardProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
  tone?: 'default' | 'amber' | 'red';
  rightAction?: React.ReactNode;
  children: React.ReactNode;
}

const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  title,
  icon,
  defaultOpen = true,
  count,
  tone = 'default',
  rightAction,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  const borderClass =
    tone === 'red'
      ? 'border-red-300 dark:border-red-800/80 bg-red-50/70 dark:bg-red-950/30'
      : tone === 'amber'
      ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/25'
      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';

  return (
    <section className={`rounded-2xl border ${borderClass} overflow-hidden`}>
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2.5 text-left min-h-[44px] py-1"
        >
          <span className="shrink-0">{icon}</span>
          <span className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </span>
          {typeof count === 'number' && (
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              ({count})
            </span>
          )}
          <span className="ml-auto text-slate-400 dark:text-slate-500 shrink-0">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
        {rightAction && <div className="shrink-0">{rightAction}</div>}
      </div>

      {open && (
        <div className="border-t border-slate-200/70 dark:border-slate-800/70 px-4 py-3.5">
          {children}
        </div>
      )}
    </section>
  );
};

function formatAnswerForPlainText(question: string, answer: StructuredAnswer, t: UIStrings): string {
  const lines: string[] = [];
  lines.push(`${answer.title}`);
  lines.push(`Q: ${question}`);
  lines.push('');

  if (answer.critical_warnings.length > 0) {
    lines.push(`! ${t.sections.criticalWarnings.toUpperCase()}`);
    answer.critical_warnings.forEach((w) => lines.push(`- ${w.text} [${w.sources.join(', ')}]`));
    lines.push('');
  }

  if (answer.scope_summary) {
    lines.push(`${t.sections.scopeSummary}: ${answer.scope_summary.text}`);
    lines.push('');
  }

  if (answer.materials_tools.length > 0) {
    lines.push(t.sections.materialsTools);
    answer.materials_tools.forEach((m) =>
      lines.push(`- ${m.item}${m.spec_qty ? ` (${m.spec_qty})` : ''} [${m.type}]`)
    );
    lines.push('');
  }

  if (answer.steps.length > 0) {
    lines.push(t.sections.steps.toUpperCase());
    answer.steps.forEach((s) => {
      lines.push(`${s.no}. ${s.phase ? `[${s.phase}] ` : ''}${s.action}`);
      if (s.details) lines.push(`   ${s.details}`);
      if (s.caution) lines.push(`   ${t.stepLabels.caution}: ${s.caution}`);
      if (s.check) lines.push(`   ${t.stepLabels.verify}: ${s.check}`);
    });
    lines.push('');
  }

  if (answer.quality_checks.length > 0) {
    lines.push(t.sections.qualityChecks);
    answer.quality_checks.forEach((q) => lines.push(`- ${q.check}: ${q.criteria}`));
    lines.push('');
  }

  if (answer.references.length > 0) {
    lines.push(t.sections.references);
    answer.references.forEach((r) =>
      lines.push(`- ${r.document} (${r.revision}) · ${r.chapter} · ${r.pages}`)
    );
  }

  return lines.join('\n');
}

export const AnswerView: React.FC<AnswerViewProps> = ({
  qaId,
  question,
  answer,
  answerLanguage,
  cachedLanguages,
  translatingLang,
  translateError,
  isOnline,
  onTranslate,
  reportUrl,
  dark,
  t,
}) => {
  const [quickView, setQuickView] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flowchartFailed, setFlowchartFailed] = useState(false);

  const answerT = TRANSLATIONS[answerLanguage];

  useEffect(() => {
    setFlowchartFailed(false);
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
          title: answer.title,
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
    <article className="space-y-3">
      {/* Header & Controls Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-xs font-medium">
          {statusConfig.icon}
          <span className={statusConfig.textClass}>{statusConfig.label}</span>
        </div>

        <h2 className="mt-1.5 font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
          {answer.title}
        </h2>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          {/* Quick view / Full view segmented toggle */}
          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => setQuickView(false)}
              className={`px-3 min-h-[38px] rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                !quickView
                  ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {t.fullView}
            </button>
            <button
              type="button"
              onClick={() => setQuickView(true)}
              className={`px-3 min-h-[38px] rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                quickView
                  ? 'bg-white dark:bg-slate-950 text-sky-700 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {t.quickView}
            </button>
          </div>

          {/* Copy / Share / Report */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t.copied : t.copy}
            </button>

            <button
              type="button"
              onClick={() => void handleShare()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Share2 className="h-3.5 w-3.5" />
              {t.share}
            </button>

            {safeReportHref && (
              <a
                href={safeReportHref}
                target={safeReportHref.startsWith('http') ? '_blank' : undefined}
                rel={safeReportHref.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <Flag className="h-3.5 w-3.5" />
                {t.reportProblem}
              </a>
            )}
          </div>
        </div>

        {/* Translate Mini Guideline Row */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            {translatingLang ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600 dark:text-sky-400" />
            ) : (
              <Languages className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            )}
            <span>{translatingLang ? t.translating : t.translateLabel}</span>
          </div>

          <div
            role="group"
            aria-label={t.translateLabel}
            className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5"
          >
            {LANGUAGE_OPTIONS.map((opt) => {
              const active = answerLanguage === opt.code;
              const isCached = cachedLanguages.includes(opt.code);
              const disabled = Boolean(translatingLang) || (!isOnline && !isCached);
              return (
                <button
                  key={opt.code}
                  type="button"
                  disabled={disabled}
                  onClick={() => onTranslate(opt.code)}
                  className={`px-2.5 min-h-[34px] rounded-md text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-45 ${
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
        </div>

        {translateError && (
          <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
            {translateError}
          </p>
        )}
      </div>

      {/* 1. Critical Warnings (Pinned at top in red, always visible) */}
      {answer.critical_warnings.length > 0 && (
        <section
          aria-label={answerT.sections.criticalWarnings}
          className="rounded-2xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 sm:p-5"
        >
          <div className="flex items-center gap-2 text-red-800 dark:text-red-300 font-display text-sm sm:text-base font-bold">
            <AlertOctagon className="h-5 w-5 shrink-0" />
            <span>{answerT.sections.criticalWarnings}</span>
          </div>
          <ul className="mt-3 space-y-2">
            {answer.critical_warnings.map((w, i) => (
              <li
                key={i}
                className="text-sm font-medium text-red-950 dark:text-red-100 leading-relaxed flex items-start gap-2"
              >
                <span className="font-mono text-xs text-red-700 dark:text-red-300 mt-0.5 shrink-0">
                  [{w.sources.join(',')}]
                </span>
                <span>{w.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 2. Guideline Basis & Scope (Shown in both Quick and Full view) */}
      {answer.scope_summary && (
        <CollapsibleCard
          title={answerT.sections.scopeSummary}
          icon={<Target className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
        >
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            {answer.scope_summary.text}{' '}
            <span className="font-mono text-xs text-slate-400">
              [{answer.scope_summary.sources.join(', ')}]
            </span>
          </p>
        </CollapsibleCard>
      )}

      {/* 3. Applies To */}
      {!quickView && answer.applies_to.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.appliesTo}
          icon={<Users className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          count={answer.applies_to.length}
        >
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            {answer.applies_to.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="font-mono text-xs text-slate-400 mt-0.5 shrink-0">
                  [{item.sources.join(',')}]
                </span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </CollapsibleCard>
      )}

      {/* 4. Prerequisites */}
      {!quickView && answer.prerequisites.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.prerequisites}
          icon={<FileCheck2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          count={answer.prerequisites.length}
        >
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            {answer.prerequisites.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="font-mono text-xs text-slate-400 mt-0.5 shrink-0">
                  [{item.sources.join(',')}]
                </span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </CollapsibleCard>
      )}

      {/* 5. Materials & Tools (Table) */}
      {!quickView && answer.materials_tools.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.materialsTools}
          icon={<Wrench className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          count={answer.materials_tools.length}
        >
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[460px] text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3">{answerT.tableCols.item}</th>
                  <th className="py-2 pr-3">{answerT.tableCols.specQty}</th>
                  <th className="py-2 pr-3">{answerT.tableCols.type}</th>
                  <th className="py-2 text-right">Src</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {answer.materials_tools.map((row, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">
                      {row.item}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                      {row.spec_qty || '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-slate-600 dark:text-slate-400 capitalize">
                      {row.type}
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs text-slate-400">
                      {row.sources.join(',')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleCard>
      )}

      {/* 6. Hazards & PPE */}
      {!quickView && answer.hazards_ppe.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.hazardsPpe}
          icon={<HardHat className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
          count={answer.hazards_ppe.length}
        >
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            {answer.hazards_ppe.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="font-mono text-xs uppercase text-amber-700 dark:text-amber-400 mt-0.5 shrink-0">
                  {item.kind}
                </span>
                <span className="flex-1">{item.item}</span>
                <span className="font-mono text-xs text-slate-400 shrink-0">
                  [{item.sources.join(',')}]
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleCard>
      )}

      {/* 7. Mini Guideline Steps (Always shown in both Quick view and Full view, no checklists) */}
      {answer.steps.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.steps}
          icon={<ListOrdered className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          count={answer.steps.length}
        >
          <ol className="space-y-3">
            {answer.steps.map((step, idx) => (
              <li
                key={`${idx}_${step.no}`}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3.5"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 min-w-[24px] px-1.5 shrink-0 items-center justify-center rounded-md bg-sky-100 dark:bg-sky-900/50 font-mono text-xs font-bold text-sky-700 dark:text-sky-300 tabular-nums">
                    {step.no}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {step.phase && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
                          {step.phase}
                        </span>
                      )}
                      <span className="font-mono text-xs text-slate-400 ml-auto">
                        [{step.sources.join(',')}]
                      </span>
                    </div>

                    <h4 className="mt-0.5 text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {step.action}
                    </h4>

                    {step.details && (
                      <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {step.details}
                      </p>
                    )}

                    {step.caution && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                          {answerT.stepLabels.caution}: {step.caution}
                        </span>
                      </p>
                    )}

                    {step.check && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-sky-800 dark:text-sky-300">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                          {answerT.stepLabels.verify}: {step.check}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </CollapsibleCard>
      )}

      {/* 8. Flowchart (Lazy-loaded Mermaid; hidden silently on error) */}
      {!quickView && answer.flowchart && !flowchartFailed && (
        <CollapsibleCard
          title={answerT.sections.flowchart}
          icon={<GitBranch className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          defaultOpen={false}
        >
          <MermaidDiagram
            flowchart={answer.flowchart}
            dark={dark}
            onRenderFailed={handleFlowchartFailed}
          />
        </CollapsibleCard>
      )}

      {/* 9. Tables (Horizontal scroll) */}
      {!quickView && answer.tables.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.tables}
          icon={<Table2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          count={answer.tables.length}
        >
          <div className="space-y-5">
            {answer.tables.map((tbl, tIdx) => (
              <div key={tIdx} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {tbl.title}
                  </h4>
                  <span className="font-mono text-xs text-slate-400">
                    [{tbl.sources.join(',')}]
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full min-w-[440px] text-left text-xs sm:text-sm border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-950/60">
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        {tbl.headers.map((h, hIdx) => (
                          <th
                            key={hIdx}
                            className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap"
                          >
                            {h}
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
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* 10. Quality Checks */}
      {!quickView && answer.quality_checks.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.qualityChecks}
          icon={<ClipboardCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          count={answer.quality_checks.length}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3">{answerT.tableCols.check}</th>
                  <th className="py-2 pr-3">{answerT.tableCols.criteria}</th>
                  <th className="py-2 text-right">Src</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {answer.quality_checks.map((qc, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">
                      {qc.check}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-300 tabular-nums">
                      {qc.criteria}
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs text-slate-400">
                      {qc.sources.join(',')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleCard>
      )}

      {/* 11. Site Cleanup */}
      {!quickView && answer.site_cleanup.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.siteCleanup}
          icon={<Sparkles className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          count={answer.site_cleanup.length}
          defaultOpen={false}
        >
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            {answer.site_cleanup.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="font-mono text-xs text-slate-400 mt-0.5 shrink-0">
                  [{item.sources.join(',')}]
                </span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </CollapsibleCard>
      )}

      {/* 12. Exit & Handover */}
      {!quickView && answer.exit_handover.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.exitHandover}
          icon={<LogOut className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          count={answer.exit_handover.length}
          defaultOpen={false}
        >
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            {answer.exit_handover.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="font-mono text-xs text-slate-400 mt-0.5 shrink-0">
                  [{item.sources.join(',')}]
                </span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </CollapsibleCard>
      )}

      {/* 13. Records & Reporting */}
      {!quickView && answer.records_reporting.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.recordsReporting}
          icon={<FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          count={answer.records_reporting.length}
          defaultOpen={false}
        >
          <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            {answer.records_reporting.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="font-mono text-xs text-slate-400 mt-0.5 shrink-0">
                  [{item.sources.join(',')}]
                </span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </CollapsibleCard>
      )}

      {/* 14. Not Specified in SOPs */}
      {answer.not_specified.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.notSpecified}
          icon={<HelpCircle className="h-4 w-4 text-slate-500 dark:text-slate-400" />}
          count={answer.not_specified.length}
        >
          <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300 list-disc pl-5">
            {answer.not_specified.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </CollapsibleCard>
      )}

      {/* 15. Conflicts */}
      {answer.conflicts.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.conflicts}
          icon={<ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
          count={answer.conflicts.length}
          tone="amber"
        >
          <ul className="space-y-2 text-sm text-amber-950 dark:text-amber-100 list-disc pl-5">
            {answer.conflicts.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </CollapsibleCard>
      )}

      {/* 16. Related SOPs */}
      {!quickView && answer.related_sops.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.relatedSops}
          icon={<Layers className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          count={answer.related_sops.length}
          defaultOpen={false}
        >
          <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200 list-disc pl-5">
            {answer.related_sops.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </CollapsibleCard>
      )}

      {/* 17. References */}
      {answer.references.length > 0 && (
        <CollapsibleCard
          title={answerT.sections.references}
          icon={<BookOpen className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          count={answer.references.length}
        >
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
                    className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 hover:border-sky-400 dark:hover:border-sky-600 px-3 py-2 min-h-[44px] transition-colors"
                  >
                    {content}
                  </a>
                );
              }

              return (
                <div
                  key={idx}
                  className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-3 py-2 min-h-[44px]"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </CollapsibleCard>
      )}
    </article>
  );
};
