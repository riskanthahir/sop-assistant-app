import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Flag,
  GitBranch,
  HelpCircle,
  Languages,
  Loader2,
  Share2,
  ShieldAlert,
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

/**
 * Strips any accidental inline chunk markers such as [C1], [C1, C2], or (C1)
 * from rendered prose while preserving ordinary engineering text.
 */
function cleanProse(text: string): string {
  return text
    .replace(/\s*\[(?:C\d+(?:\s*,\s*C\d+)*)\]/gi, '')
    .replace(/\s*\((?:C\d+(?:\s*,\s*C\d+)*)\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
  items: string[];
}

const BulletSection: React.FC<BulletSectionProps> = ({ title, items }) => {
  if (items.length === 0) return null;
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        {title}
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
  onTranslate,
  reportUrl,
  dark,
  t,
}) => {
  const [quickView, setQuickView] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFlowchart, setShowFlowchart] = useState(false);
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
    <article className="rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 shadow-2xs">
      {/* Header & Controls */}
      <header className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {statusConfig.icon}
            <span className={statusConfig.textClass}>{statusConfig.label}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Quick / Full toggle */}
            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setQuickView(false)}
                className={`px-2.5 min-h-[32px] rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
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
                className={`px-2.5 min-h-[32px] rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  quickView
                    ? 'bg-white dark:bg-slate-950 text-sky-700 dark:text-sky-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {t.quickView}
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 min-h-[34px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? t.copied : t.copy}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleShare()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 min-h-[34px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>{t.share}</span>
            </button>

            {safeReportHref && (
              <a
                href={safeReportHref}
                target={safeReportHref.startsWith('http') ? '_blank' : undefined}
                rel={safeReportHref.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 min-h-[34px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <Flag className="h-3.5 w-3.5" />
                <span>{t.reportProblem}</span>
              </a>
            )}
          </div>
        </div>

        <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
          {cleanProse(answer.title)}
        </h2>

        {/* Translate Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
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
                  className={`px-2.5 min-h-[30px] rounded-md text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-45 ${
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
            items={answer.applies_to.map((item) => cleanProse(item.text))}
          />

          <BulletSection
            title={answerT.sections.prerequisites}
            items={answer.prerequisites.map((item) => cleanProse(item.text))}
          />

          <BulletSection
            title={answerT.sections.materialsTools}
            items={answer.materials_tools.map(
              (m) =>
                `${cleanProse(m.item)}${m.spec_qty ? ` — ${cleanProse(m.spec_qty)}` : ''} (${m.type})`
            )}
          />

          <BulletSection
            title={answerT.sections.hazardsPpe}
            items={answer.hazards_ppe.map(
              (h) => `${h.kind.toUpperCase()}: ${cleanProse(h.item)}`
            )}
          />
        </>
      )}

      {/* Procedure Steps (Numbered list, NO checklists) */}
      {answer.steps.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            {answerT.sections.steps}
          </h3>
          <ol className="list-decimal pl-5 space-y-3 text-sm text-slate-800 dark:text-slate-200 leading-relaxed marker:font-semibold marker:text-sky-700 dark:marker:text-sky-400">
            {answer.steps.map((step, idx) => (
              <li key={`${idx}_${step.no}`} className="pl-1">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {step.phase ? `${cleanProse(step.phase)} — ` : ''}
                    {cleanProse(step.action)}
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
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Tables (Full view, no Src column) */}
      {!quickView && answer.tables.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            {answerT.sections.tables}
          </h3>
          {answer.tables.map((tbl, tIdx) => (
            <div key={tIdx} className="space-y-1.5">
              {tbl.title && (
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {cleanProse(tbl.title)}
                </p>
              )}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[400px] text-left text-xs sm:text-sm border-collapse">
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
            items={answer.quality_checks.map(
              (qc) => `${cleanProse(qc.check)}${qc.criteria ? ` — ${cleanProse(qc.criteria)}` : ''}`
            )}
          />

          <BulletSection
            title={answerT.sections.siteCleanup}
            items={answer.site_cleanup.map((item) => cleanProse(item.text))}
          />

          <BulletSection
            title={answerT.sections.exitHandover}
            items={answer.exit_handover.map((item) => cleanProse(item.text))}
          />

          <BulletSection
            title={answerT.sections.recordsReporting}
            items={answer.records_reporting.map((item) => cleanProse(item.text))}
          />

          <BulletSection
            title={answerT.sections.relatedSops}
            items={answer.related_sops.map((item) => cleanProse(item))}
          />
        </>
      )}

      {/* Not Specified & Conflicts */}
      <BulletSection
        title={answerT.sections.notSpecified}
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
