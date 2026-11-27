import { GoogleGenAI, ThinkingLevel, Type, type Schema } from '@google/genai';
import type { TaggedRetrievedChunk } from './rag.ts';
import type { GlossaryEntry, Language, StructuredAnswer } from './types.ts';

const EMBED_DIM = 768;

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String((err as Error)?.message || err || '');
      const status = (err as { status?: number })?.status || 0;
      const retryable =
        status === 429 ||
        status >= 500 ||
        /429|RESOURCE_EXHAUSTED|503|500|ETIMEDOUT|ECONNRESET/i.test(msg);
      if (!retryable || attempt === maxRetries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 900 * Math.pow(2, attempt)));
    }
  }
  throw new Error('Retry exhausted');
}

export async function embedQueryText(query: string): Promise<number[]> {
  const ai = getGeminiClient();
  const embedModel = process.env.EMBED_MODEL?.trim() || 'gemini-embedding-2';
  const res = await withRetry(() =>
    ai.models.embedContent({
      model: embedModel,
      contents: query,
      config: {
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: EMBED_DIM,
      },
    })
  );
  const vec = res.embeddings?.[0]?.values;
  if (!vec || vec.length === 0) {
    throw new Error('Failed to generate query embedding.');
  }
  return vec;
}

const SOURCED_TEXT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING },
    sources: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['text', 'sources'],
};

const ANSWER_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    status: {
      type: Type.STRING,
      description: 'Must be answered, partially_covered, or not_covered.',
    },
    title: { type: Type.STRING },
    critical_warnings: {
      type: Type.ARRAY,
      items: SOURCED_TEXT_SCHEMA,
    },
    scope_summary: SOURCED_TEXT_SCHEMA,
    applies_to: {
      type: Type.ARRAY,
      items: SOURCED_TEXT_SCHEMA,
    },
    prerequisites: {
      type: Type.ARRAY,
      items: SOURCED_TEXT_SCHEMA,
    },
    materials_tools: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING },
          spec_qty: { type: Type.STRING },
          type: {
            type: Type.STRING,
            description: 'material, tool, equipment, or document',
          },
          sources: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['item', 'spec_qty', 'type', 'sources'],
      },
    },
    hazards_ppe: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING },
          kind: {
            type: Type.STRING,
            description: 'hazard or ppe',
          },
          sources: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['item', 'kind', 'sources'],
      },
    },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          no: { type: Type.STRING },
          phase: { type: Type.STRING },
          action: { type: Type.STRING },
          details: { type: Type.STRING },
          caution: { type: Type.STRING },
          check: { type: Type.STRING },
          sources: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['no', 'phase', 'action', 'details', 'caution', 'check', 'sources'],
      },
    },
    flowchart: {
      type: Type.OBJECT,
      properties: {
        nodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              label: { type: Type.STRING },
              type: {
                type: Type.STRING,
                description: 'start, step, decision, or end',
              },
            },
            required: ['id', 'label', 'type'],
          },
        },
        edges: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              from: { type: Type.STRING },
              to: { type: Type.STRING },
              label: { type: Type.STRING },
            },
            required: ['from', 'to', 'label'],
          },
        },
      },
      required: ['nodes', 'edges'],
    },
    tables: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          headers: { type: Type.ARRAY, items: { type: Type.STRING } },
          rows: {
            type: Type.ARRAY,
            items: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          sources: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['title', 'headers', 'rows', 'sources'],
      },
    },
    quality_checks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          check: { type: Type.STRING },
          criteria: { type: Type.STRING },
          sources: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['check', 'criteria', 'sources'],
      },
    },
    site_cleanup: {
      type: Type.ARRAY,
      items: SOURCED_TEXT_SCHEMA,
    },
    exit_handover: {
      type: Type.ARRAY,
      items: SOURCED_TEXT_SCHEMA,
    },
    records_reporting: {
      type: Type.ARRAY,
      items: SOURCED_TEXT_SCHEMA,
    },
    not_specified: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    conflicts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    related_sops: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    'status',
    'title',
    'critical_warnings',
    'applies_to',
    'prerequisites',
    'materials_tools',
    'hazards_ppe',
    'steps',
    'tables',
    'quality_checks',
    'site_cleanup',
    'exit_handover',
    'records_reporting',
    'not_specified',
    'conflicts',
    'related_sops',
  ],
};

function selectRelevantGlossaryForText(
  sourceText: string,
  glossary: GlossaryEntry[],
  language: Language
): string {
  if (language === 'en' || glossary.length === 0) return '';
  const combined = sourceText.toLowerCase();

  const matched = glossary.filter((g) => combined.includes(g.term.toLowerCase())).slice(0, 30);
  if (matched.length === 0) return '';

  return matched
    .map((g) => {
      const local = language === 'si' ? g.si : g.ta;
      return `- ${g.term}: ${local}`;
    })
    .join('\n');
}

function selectRelevantGlossary(
  chunks: TaggedRetrievedChunk[],
  question: string,
  glossary: GlossaryEntry[],
  language: Language
): string {
  return selectRelevantGlossaryForText(
    question + ' ' + chunks.map((c) => c.record.chunk.text).join(' '),
    glossary,
    language
  );
}

export async function generateSopAnswer(params: {
  question: string;
  language: Language;
  chunks: TaggedRetrievedChunk[];
  glossary: GlossaryEntry[];
  conversationContext?: string;
}): Promise<{ parsed: Record<string, unknown>; rawText: string }> {
  const { question, language, chunks, glossary, conversationContext } = params;
  const ai = getGeminiClient();
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-4-hydrogen';

  const langLabel =
    language === 'si' ? 'Sinhala (සිංහල)' : language === 'ta' ? 'Tamil (தமிழ்)' : 'English';

  const glossaryBlock = selectRelevantGlossary(chunks, question, glossary, language);

  const systemInstruction = [
    'You are an expert Telecom Field Engineering SOP Assistant inside a multi-turn chat screen. Produce a clear, field-ready MINI GUIDELINE grounded in the provided SOP chunks ([C1], [C2], ...).',
    'INTELLIGENT RECONSTRUCTION & GROUNDING RULES:',
    '1. Ground every technical fact, spec, safety rule, tool, and step in the provided SOP chunks ([C1], [C2], ...). NEVER invent numeric specs (torque N·m, cable gauge, breaker rating, voltage/dBm thresholds, dimensions, part numbers, or standards) that are not in the chunks.',
    '2. If the user asks about a task NOT written as a standalone SOP section (e.g., replacing a faulty Battery, RRU, AAU, Rectifier module, or troubleshooting/decommissioning), DO NOT refuse or leave steps empty when related installation, isolation, safety, removal, commissioning, or waste-management rules exist in the chunks.',
    '3. Instead, INTELLIGENTLY REVERSE-ENGINEER and reconstruct a logical Mini Guideline from the available SOP sections:',
    '   - Combine general safety/PPE, power-off/breaker isolation, ESD, and grounding rules (e.g., disconnect power source/breakers before cable removal; remove ground/PGND last on removal and connect ground first on installation).',
    '   - Logically reverse the SOP installation, mounting, cabling, and tightening sequence to safely remove the faulty unit.',
    '   - Include SOP waste/disposal handling if present for removed/faulty hardware, then guide re-installation of the replacement unit in forward SOP order with torque specs and power-on verification.',
    '   - In "scope_summary", state clearly in a concise mini paragraph when the guideline was synthesized/reverse-engineered from related SOP rules. Set "status" to "answered" if the workflow is solidly covered by SOP logic, or "partially_covered" if major details are missing. Only list genuinely absent SOP-only specs in "not_specified".',
    '4. CONVERSATIONAL MINI STRUCTURED PARAGRAPH FORMAT (BULLETS & NUMBERING, NO CHECKLISTS):',
    '   - Write "scope_summary.text" as a cohesive, conversational mini structured paragraph that directly answers the user question and frames the procedure.',
    '   - Organize "steps" as a clean sequential numbered list ("1", "2", "3", ...) with clear phase labels, crisp action headings, and concise mini-paragraph details.',
    '   - Write "critical_warnings", "applies_to", "prerequisites", "hazards_ppe", "quality_checks", "site_cleanup", "exit_handover", and "records_reporting" as crisp, self-contained bullet points.',
    '   - NEVER format steps or any section as tick-box checklists, [ ] checkboxes, or form rows. Summarize any SOP contractor/handover checklists as plain guideline bullets or numbered actions.',
    '5. CITATION SEPARATION (CRITICAL):',
    '   - NEVER write chunk tags like [C1], [C2], C1, C2, or "Chunk 1" inside ANY natural-language text field (title, scope_summary.text, critical_warnings[].text, applies_to[].text, prerequisites[].text, steps, quality_checks, site_cleanup, exit_handover, records_reporting, not_specified, conflicts, related_sops). Keep all prose 100% clean for the field engineer.',
    '   - Put the supporting chunk IDs ONLY inside the JSON "sources" arrays (e.g. ["C1", "C2"]) so the server resolves human-readable document/page references automatically.',
    '6. If chunks conflict across documents or revisions, report both positions clearly in "conflicts" without choosing one over the other.',
    `7. Output language: ${langLabel}. Use clear, conversational, practical wording suited for field technicians.`,
    '8. For Sinhala or Tamil responses: keep engineering terms, standard names, part numbers, abbreviations, and units in English (Latin script), and on first use add the local-language translation in brackets (preferring the glossary below when available).',
    '9. Keep flowchart compact (max 10 nodes) only when a multi-step process or decision branch adds clarity.',
    glossaryBlock ? `\nTELECOM GLOSSARY (${langLabel}):\n${glossaryBlock}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const contextText = chunks
    .map((item) => {
      const c = item.record.chunk;
      return `[${item.tag}] Document: ${c.docTitle} (${c.revision}, ${c.effectiveDate}) | Chapter: ${c.chapter} | Section: ${c.section} | Pages: ${c.pageStart}-${c.pageEnd}\n${c.text}`;
    })
    .join('\n\n---\n\n');

  const promptParts = [];
  if (conversationContext?.trim()) {
    promptParts.push(`CONVERSATION CONTEXT (prior chat turns):\n${conversationContext.trim()}`);
  }
  promptParts.push(`USER QUESTION (${langLabel}):\n${question}`);
  promptParts.push(`RETRIEVED SOP CHUNKS:\n${contextText}`);
  const prompt = promptParts.join('\n\n');

  const isGemini3or4 = /^gemini-[34]/i.test(model);

  const config: Record<string, unknown> = {
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: ANSWER_SCHEMA,
    maxOutputTokens: 8192,
  };

  if (isGemini3or4) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
  } else {
    config.temperature = 0;
  }

  const response = await withRetry(() =>
    ai.models.generateContent({
      model,
      contents: prompt,
      config,
    })
  );

  const rawText = (response.text || '{}').trim();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } else {
      throw new Error('Model returned invalid JSON.');
    }
  }

  return { parsed, rawText };
}

export async function translateSopAnswer(params: {
  answer: StructuredAnswer;
  targetLanguage: Language;
  glossary: GlossaryEntry[];
}): Promise<StructuredAnswer> {
  const { answer, targetLanguage, glossary } = params;
  const ai = getGeminiClient();
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-4-hydrogen';

  const langLabel =
    targetLanguage === 'si'
      ? 'Sinhala (සිංහල)'
      : targetLanguage === 'ta'
      ? 'Tamil (தமிழ்)'
      : 'English';

  const { references: originalRefs, ...translatablePayload } = answer;
  const serializedPayload = JSON.stringify(translatablePayload);
  const glossaryBlock = selectRelevantGlossaryForText(serializedPayload, glossary, targetLanguage);

  const systemInstruction = [
    `You are translating a Telecom Field Engineering SOP Mini Guideline into ${langLabel}.`,
    'TRANSLATION RULES:',
    `1. Translate ALL natural-language text fields cleanly and naturally into ${langLabel} for field technicians.`,
    '2. Preserve 100% of the technical meaning, step order, step numbers ("no"), numeric measurements, torque values, cable sizes, breaker ratings, part numbers, model names, and units.',
    '3. Keep EVERY "sources" array (e.g. ["C1", "C2"]), enum value ("status", "materials_tools[].type", "hazards_ppe[].kind", "flowchart.nodes[].type"), and flowchart node "id" / edge "from"/"to" EXACTLY unchanged.',
    '4. NEVER insert chunk references like [C1], [C2], C1, or C2 inside any translated text field. Do NOT add checkboxes or checklists.',
    targetLanguage === 'en'
      ? '5. Use clear, concise field engineering English.'
      : '5. For Sinhala or Tamil: keep engineering terms, standard names, part numbers, abbreviations, and units in English (Latin script), and on first use add the local-language translation in brackets (preferring the glossary below when available).',
    glossaryBlock ? `\nTELECOM GLOSSARY (${langLabel}):\n${glossaryBlock}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const isGemini3or4 = /^gemini-[34]/i.test(model);
  const config: Record<string, unknown> = {
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: ANSWER_SCHEMA,
    maxOutputTokens: 8192,
  };

  if (isGemini3or4) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  } else {
    config.temperature = 0;
  }

  const response = await withRetry(() =>
    ai.models.generateContent({
      model,
      contents: `Translate this SOP Mini Guideline JSON into ${langLabel}:\n${serializedPayload}`,
      config,
    })
  );

  const rawText = (response.text || '{}').trim();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } else {
      throw new Error('Model returned invalid JSON during translation.');
    }
  }

  const pickSources = (candidate: unknown, fallback: string[]): string[] => {
    if (Array.isArray(candidate)) {
      const cleaned = candidate
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean);
      if (cleaned.length > 0) return cleaned;
    }
    return fallback;
  };

  const mergeSourcedList = (
    candidate: unknown,
    original: StructuredAnswer['critical_warnings']
  ) => {
    if (!Array.isArray(candidate) || original.length === 0) return original;
    return candidate
      .map((entry, idx) => {
        if (!entry || typeof entry !== 'object') return null;
        const rec = entry as Record<string, unknown>;
        const text = typeof rec.text === 'string' ? rec.text.trim() : '';
        if (!text) return null;
        return {
          text,
          sources: pickSources(rec.sources, original[idx]?.sources || []),
        };
      })
      .filter((x): x is { text: string; sources: string[] } => x !== null);
  };

  const toStringList = (candidate: unknown, fallback: string[]): string[] =>
    Array.isArray(candidate)
      ? candidate.map((v) => String(v ?? '').trim()).filter(Boolean)
      : fallback;

  const translatedScope =
    answer.scope_summary && parsed.scope_summary && typeof parsed.scope_summary === 'object'
      ? {
          text:
            typeof (parsed.scope_summary as Record<string, unknown>).text === 'string' &&
            String((parsed.scope_summary as Record<string, unknown>).text).trim()
              ? String((parsed.scope_summary as Record<string, unknown>).text).trim()
              : answer.scope_summary.text,
          sources: pickSources(
            (parsed.scope_summary as Record<string, unknown>).sources,
            answer.scope_summary.sources
          ),
        }
      : answer.scope_summary;

  const translatedMaterials: StructuredAnswer['materials_tools'] =
    Array.isArray(parsed.materials_tools) && answer.materials_tools.length > 0
      ? parsed.materials_tools
          .map((entry, idx) => {
            if (!entry || typeof entry !== 'object') return null;
            const rec = entry as Record<string, unknown>;
            const orig = answer.materials_tools[idx];
            const item = typeof rec.item === 'string' ? rec.item.trim() : '';
            if (!item) return null;
            return {
              item,
              spec_qty:
                typeof rec.spec_qty === 'string' ? rec.spec_qty.trim() : orig?.spec_qty || '',
              type: orig?.type || 'material',
              sources: pickSources(rec.sources, orig?.sources || []),
            };
          })
          .filter((x): x is StructuredAnswer['materials_tools'][number] => x !== null)
      : answer.materials_tools;

  const translatedHazards: StructuredAnswer['hazards_ppe'] =
    Array.isArray(parsed.hazards_ppe) && answer.hazards_ppe.length > 0
      ? parsed.hazards_ppe
          .map((entry, idx) => {
            if (!entry || typeof entry !== 'object') return null;
            const rec = entry as Record<string, unknown>;
            const orig = answer.hazards_ppe[idx];
            const item = typeof rec.item === 'string' ? rec.item.trim() : '';
            if (!item) return null;
            return {
              item,
              kind: orig?.kind || (rec.kind === 'ppe' ? 'ppe' : 'hazard'),
              sources: pickSources(rec.sources, orig?.sources || []),
            };
          })
          .filter((x): x is StructuredAnswer['hazards_ppe'][number] => x !== null)
      : answer.hazards_ppe;

  const translatedSteps: StructuredAnswer['steps'] =
    Array.isArray(parsed.steps) && answer.steps.length > 0
      ? parsed.steps
          .map((entry, idx) => {
            if (!entry || typeof entry !== 'object') return null;
            const rec = entry as Record<string, unknown>;
            const orig = answer.steps[idx];
            const action = typeof rec.action === 'string' ? rec.action.trim() : '';
            if (!action) return null;
            return {
              no: orig?.no || (typeof rec.no === 'string' && rec.no.trim() ? rec.no.trim() : String(idx + 1)),
              phase: typeof rec.phase === 'string' ? rec.phase.trim() : orig?.phase || '',
              action,
              details: typeof rec.details === 'string' ? rec.details.trim() : orig?.details || '',
              caution: typeof rec.caution === 'string' ? rec.caution.trim() : '',
              check: typeof rec.check === 'string' ? rec.check.trim() : '',
              sources: pickSources(rec.sources, orig?.sources || []),
            };
          })
          .filter((x): x is StructuredAnswer['steps'][number] => x !== null)
      : answer.steps;

  const translatedTables: StructuredAnswer['tables'] =
    Array.isArray(parsed.tables) && answer.tables.length > 0
      ? parsed.tables
          .map((entry, idx) => {
            if (!entry || typeof entry !== 'object') return null;
            const rec = entry as Record<string, unknown>;
            const orig = answer.tables[idx];
            const headers = Array.isArray(rec.headers)
              ? rec.headers.map((h) => String(h ?? '').trim())
              : orig?.headers || [];
            const rows = Array.isArray(rec.rows)
              ? rec.rows
                  .filter((r) => Array.isArray(r))
                  .map((r) => (r as unknown[]).map((c) => String(c ?? '').trim()))
              : orig?.rows || [];
            if (headers.length === 0 || rows.length === 0) return orig || null;
            return {
              title: typeof rec.title === 'string' ? rec.title.trim() : orig?.title || '',
              headers,
              rows,
              sources: pickSources(rec.sources, orig?.sources || []),
            };
          })
          .filter((x): x is StructuredAnswer['tables'][number] => x !== null)
      : answer.tables;

  const translatedChecks: StructuredAnswer['quality_checks'] =
    Array.isArray(parsed.quality_checks) && answer.quality_checks.length > 0
      ? parsed.quality_checks
          .map((entry, idx) => {
            if (!entry || typeof entry !== 'object') return null;
            const rec = entry as Record<string, unknown>;
            const orig = answer.quality_checks[idx];
            const check = typeof rec.check === 'string' ? rec.check.trim() : '';
            if (!check) return null;
            return {
              check,
              criteria:
                typeof rec.criteria === 'string' ? rec.criteria.trim() : orig?.criteria || '',
              sources: pickSources(rec.sources, orig?.sources || []),
            };
          })
          .filter((x): x is StructuredAnswer['quality_checks'][number] => x !== null)
      : answer.quality_checks;

  let translatedFlowchart: StructuredAnswer['flowchart'] = answer.flowchart;
  if (answer.flowchart && parsed.flowchart && typeof parsed.flowchart === 'object') {
    const fc = parsed.flowchart as Record<string, unknown>;
    const rawNodes = Array.isArray(fc.nodes) ? fc.nodes : [];
    const rawEdges = Array.isArray(fc.edges) ? fc.edges : [];
    const nodes = rawNodes
      .filter((n) => n && typeof n === 'object')
      .map((n, idx) => {
        const rec = n as Record<string, unknown>;
        const origNode = answer.flowchart?.nodes[idx];
        return {
          id: String(rec.id ?? origNode?.id ?? '').trim(),
          label: String(rec.label ?? origNode?.label ?? '').trim(),
          type: origNode?.type || 'step',
        };
      })
      .filter((n) => n.id && n.label);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = rawEdges
      .filter((e) => e && typeof e === 'object')
      .map((e) => {
        const rec = e as Record<string, unknown>;
        return {
          from: String(rec.from ?? '').trim(),
          to: String(rec.to ?? '').trim(),
          label: String(rec.label ?? '').trim(),
        };
      })
      .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
    if (nodes.length >= 2 && edges.length >= 1) {
      translatedFlowchart = { nodes, edges };
    }
  }

  return {
    status: answer.status,
    title:
      typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : answer.title,
    critical_warnings: mergeSourcedList(parsed.critical_warnings, answer.critical_warnings),
    scope_summary: translatedScope,
    applies_to: mergeSourcedList(parsed.applies_to, answer.applies_to),
    prerequisites: mergeSourcedList(parsed.prerequisites, answer.prerequisites),
    materials_tools: translatedMaterials,
    hazards_ppe: translatedHazards,
    steps: translatedSteps,
    flowchart: translatedFlowchart,
    tables: translatedTables,
    quality_checks: translatedChecks,
    site_cleanup: mergeSourcedList(parsed.site_cleanup, answer.site_cleanup),
    exit_handover: mergeSourcedList(parsed.exit_handover, answer.exit_handover),
    records_reporting: mergeSourcedList(parsed.records_reporting, answer.records_reporting),
    not_specified: toStringList(parsed.not_specified, answer.not_specified),
    conflicts: toStringList(parsed.conflicts, answer.conflicts),
    related_sops: toStringList(parsed.related_sops, answer.related_sops),
    references: originalRefs,
  };
}
