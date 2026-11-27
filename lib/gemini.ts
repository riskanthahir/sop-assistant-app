import { GoogleGenAI, ThinkingLevel, Type, type Schema } from '@google/genai';
import type { TaggedRetrievedChunk } from './rag.ts';
import type { GlossaryEntry, Language } from './types.ts';

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

function selectRelevantGlossary(
  chunks: TaggedRetrievedChunk[],
  question: string,
  glossary: GlossaryEntry[],
  language: Language
): string {
  if (language === 'en' || glossary.length === 0) return '';
  const combined = (
    question +
    ' ' +
    chunks.map((c) => c.record.chunk.text).join(' ')
  ).toLowerCase();

  const matched = glossary.filter((g) => combined.includes(g.term.toLowerCase())).slice(0, 25);
  if (matched.length === 0) return '';

  return matched
    .map((g) => {
      const local = language === 'si' ? g.si : g.ta;
      return `- ${g.term}: ${local}`;
    })
    .join('\n');
}

export async function generateSopAnswer(params: {
  question: string;
  language: Language;
  chunks: TaggedRetrievedChunk[];
  glossary: GlossaryEntry[];
}): Promise<{ parsed: Record<string, unknown>; rawText: string }> {
  const { question, language, chunks, glossary } = params;
  const ai = getGeminiClient();
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-4-hydrogen';

  const langLabel =
    language === 'si' ? 'Sinhala (සිංහල)' : language === 'ta' ? 'Tamil (தமிழ்)' : 'English';

  const glossaryBlock = selectRelevantGlossary(chunks, question, glossary, language);

  const systemInstruction = [
    'You are an internal Telecom SOP Procedure Assistant for field engineers and vendor installers.',
    'STRICT GROUNDING RULES:',
    '1. Use ONLY the provided SOP chunks ([C1], [C2], ...). Never use outside knowledge, assumptions, or "typical practice".',
    '2. Every item in critical_warnings, scope_summary, applies_to, prerequisites, materials_tools, hazards_ppe, steps, tables, quality_checks, site_cleanup, exit_handover, and records_reporting MUST include accurate "sources" tags (e.g. ["C1", "C2"]) pointing to the exact chunks supporting it.',
    '3. If a topic or section is not covered by the chunks, leave that list empty (or omit it) and list the missing topic clearly in "not_specified". NEVER invent values such as torque, distances, cable lengths, dBm thresholds, part numbers, or standards.',
    '4. If chunks conflict across documents or revisions, report both positions explicitly in "conflicts" and do NOT choose one over the other.',
    '5. Keep the SOP original step order. Keep all safety warnings faithful to the source.',
    `6. Output language: ${langLabel}. Use simple, natural wording suited for field technicians.`,
    '7. For Sinhala or Tamil responses: keep engineering terms, standard names, part numbers, abbreviations, and units in English (Latin script), and on first use add the local-language translation in brackets (preferring the glossary below when available).',
    '8. Keep flowchart compact (max 10 nodes) and only include flowchart if the chunks describe a multi-step process or decision flow; keep output concise so it completes fast.',
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

  const prompt = `USER QUESTION (${langLabel}):\n${question}\n\nRETRIEVED SOP CHUNKS:\n${contextText}`;

  const isGemini3or4 = /^gemini-[34]/i.test(model);

  const config: Record<string, unknown> = {
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: ANSWER_SCHEMA,
    maxOutputTokens: 4096,
  };

  if (isGemini3or4) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
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
