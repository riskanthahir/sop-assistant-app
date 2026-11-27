import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AnswerReference,
  DebugChunkInfo,
  GlossaryEntry,
  SopChunk,
  SopDocFile,
  SopDocMeta,
  SopIndexFile,
  StructuredAnswer,
} from './types.ts';

const EMBED_DIM = 768;
const MAX_TOP_CHUNKS = 9;
const MAX_TOTAL_CHUNKS = 16;
const MAX_CONTEXT_CHARS = 32000;

interface LoadedChunkRecord {
  docMeta: SopDocMeta;
  chunk: SopChunk;
  chunkIndex: number;
  docId: string;
  embedding: Float32Array;
  norm: number;
  tfMap: Map<string, number>;
  docLen: number;
}

interface LoadedStore {
  index: SopIndexFile;
  records: LoadedChunkRecord[];
  byDocId: Map<string, LoadedChunkRecord[]>;
  idf: Map<string, number>;
  avgDocLen: number;
  glossary: GlossaryEntry[];
}

export interface TaggedRetrievedChunk {
  tag: string;
  record: LoadedChunkRecord;
  cosineScore: number;
  keywordBoost: number;
  combinedScore: number;
  isNeighbor: boolean;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
  'will', 'shall', 'must', 'can', 'not', 'all', 'any', 'into', 'onto', 'upon',
  'have', 'has', 'had', 'use', 'used', 'using', 'before', 'after', 'during',
  'how', 'what', 'when', 'where', 'which', 'who', 'why', 'should', 'would',
]);

export function tokenizeEnglishTechTerms(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9][a-z0-9._/-]{1,32}/g);
  if (!matches) return [];
  const out: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/^[._/-]+|[._/-]+$/g, '');
    if (cleaned.length < 2 || STOP_WORDS.has(cleaned)) continue;
    out.push(cleaned);
  }
  return out;
}

function computeNorm(vec: Float32Array | number[]): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i];
    sum += v * v;
  }
  return Math.sqrt(sum) || 1;
}

function cosineSimilarity(a: number[], aNorm: number, b: Float32Array, bNorm: number): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
  }
  return dot / (aNorm * bNorm);
}

let cachedStorePromise: Promise<LoadedStore> | null = null;

async function loadStoreFromDisk(): Promise<LoadedStore> {
  const dataDir = path.join(process.cwd(), 'data');
  const docsDir = path.join(dataDir, 'docs');
  const indexPath = path.join(docsDir, 'index.json');
  const glossaryPath = path.join(dataDir, 'glossary.json');

  let index: SopIndexFile = {
    generatedAt: null,
    embedModel: 'gemini-embedding-2',
    dimensions: EMBED_DIM,
    docs: [],
  };

  try {
    const rawIndex = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(rawIndex) as SopIndexFile;
    if (parsed && Array.isArray(parsed.docs)) {
      index = parsed;
    }
  } catch {
    // Empty index fallback
  }

  let glossary: GlossaryEntry[] = [];
  try {
    const rawGlossary = await fs.readFile(glossaryPath, 'utf8');
    const parsed = JSON.parse(rawGlossary);
    if (parsed && Array.isArray(parsed.terms)) {
      glossary = parsed.terms;
    }
  } catch {
    // Optional glossary fallback
  }

  const records: LoadedChunkRecord[] = [];
  const byDocId = new Map<string, LoadedChunkRecord[]>();
  const dfMap = new Map<string, number>();
  let totalDocLen = 0;

  for (const docMeta of index.docs) {
    const jsonPath = path.join(docsDir, `${docMeta.docId}.json`);
    const binPath = path.join(docsDir, `${docMeta.docId}.bin`);
    try {
      const [rawDoc, rawBin] = await Promise.all([
        fs.readFile(jsonPath, 'utf8'),
        fs.readFile(binPath),
      ]);
      const docFile = JSON.parse(rawDoc) as SopDocFile;
      const floatBuf = new Float32Array(
        rawBin.buffer,
        rawBin.byteOffset,
        Math.floor(rawBin.byteLength / 4)
      );

      const docRecords: LoadedChunkRecord[] = [];
      const chunks = docFile.chunks || [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const offset = i * EMBED_DIM;
        if (offset + EMBED_DIM > floatBuf.length) break;
        const embedding = floatBuf.subarray(offset, offset + EMBED_DIM);
        const norm = computeNorm(embedding);

        const tokens = tokenizeEnglishTechTerms(
          `${chunk.docTitle} ${chunk.chapter} ${chunk.section} ${chunk.text}`
        );
        const tfMap = new Map<string, number>();
        for (const tok of tokens) {
          tfMap.set(tok, (tfMap.get(tok) || 0) + 1);
        }
        for (const uniqueTok of tfMap.keys()) {
          dfMap.set(uniqueTok, (dfMap.get(uniqueTok) || 0) + 1);
        }
        totalDocLen += tokens.length;

        const rec: LoadedChunkRecord = {
          docMeta,
          chunk,
          chunkIndex: i,
          docId: docMeta.docId,
          embedding,
          norm,
          tfMap,
          docLen: tokens.length,
        };
        records.push(rec);
        docRecords.push(rec);
      }

      byDocId.set(docMeta.docId, docRecords);
    } catch (err) {
      console.error(`Failed loading SOP data for ${docMeta.docId}:`, err);
    }
  }

  const N = Math.max(1, records.length);
  const idf = new Map<string, number>();
  for (const [term, df] of dfMap.entries()) {
    idf.set(term, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
  }

  return {
    index,
    records,
    byDocId,
    idf,
    avgDocLen: records.length > 0 ? totalDocLen / records.length : 1,
    glossary,
  };
}

export function getSopStore(): Promise<LoadedStore> {
  if (!cachedStorePromise) {
    cachedStorePromise = loadStoreFromDisk().catch((err) => {
      cachedStorePromise = null;
      throw err;
    });
  }
  return cachedStorePromise;
}

export function searchSopChunks(
  store: LoadedStore,
  queryText: string,
  queryVector: number[],
  minScore: number
): {
  covered: boolean;
  bestScore: number;
  selected: TaggedRetrievedChunk[];
  debugChunks: DebugChunkInfo[];
} {
  if (store.records.length === 0) {
    return {
      covered: false,
      bestScore: 0,
      selected: [],
      debugChunks: [],
    };
  }

  const qNorm = computeNorm(queryVector);
  const baseTerms = Array.from(new Set(tokenizeEnglishTechTerms(queryText)));
  const expandedTerms = new Set(baseTerms);
  if (
    baseTerms.some((t) =>
      /^(replace|replacing|replacement|swap|change|changing|faulty|damaged|defective|remove|removing|removal|dismantle|decommission|unmount)$/.test(
        t
      )
    )
  ) {
    for (const extra of [
      'install',
      'installation',
      'remove',
      'disconnect',
      'power',
      'breaker',
      'ground',
      'grounding',
      'pgnd',
      'waste',
      'safety',
    ]) {
      expandedTerms.add(extra);
    }
  }
  if (baseTerms.some((t) => /^(battery|batteries|bb|li-ion)$/.test(t))) {
    for (const extra of ['battery', 'rectifier', 'breaker', 'dc', 'waste', 'li-ion']) {
      expandedTerms.add(extra);
    }
  }

  const queryTerms = Array.from(expandedTerms);
  const baseTermSet = new Set(baseTerms);
  const k1 = 1.2;
  const b = 0.75;

  const scored = store.records.map((rec) => {
    const cosineScore = cosineSimilarity(queryVector, qNorm, rec.embedding, rec.norm);

    let bm25 = 0;
    if (queryTerms.length > 0) {
      for (const term of queryTerms) {
        const tf = rec.tfMap.get(term) || 0;
        if (tf === 0) continue;
        const termIdf = store.idf.get(term) || 0.5;
        const denom = tf + k1 * (1 - b + (b * rec.docLen) / (store.avgDocLen || 1));
        const weight = baseTermSet.has(term) ? 1 : 0.45;
        bm25 += weight * termIdf * ((tf * (k1 + 1)) / denom);
      }
    }
    // Small capped keyword boost for English technical terms
    const keywordBoost = Math.min(0.14, bm25 * 0.025);
    const combinedScore = cosineScore + keywordBoost;

    return {
      record: rec,
      cosineScore,
      keywordBoost,
      combinedScore,
    };
  });

  scored.sort((a, bItem) => bItem.combinedScore - a.combinedScore);
  const bestScore = scored[0]?.combinedScore ?? 0;

  if (bestScore < minScore) {
    const previewTop = scored.slice(0, 5).map((item, idx) => ({
      tag: `C${idx + 1}`,
      id: item.record.chunk.id,
      docTitle: item.record.chunk.docTitle,
      revision: item.record.chunk.revision,
      chapter: item.record.chunk.chapter,
      section: item.record.chunk.section,
      pageStart: item.record.chunk.pageStart,
      pageEnd: item.record.chunk.pageEnd,
      cosineScore: Number(item.cosineScore.toFixed(4)),
      keywordBoost: Number(item.keywordBoost.toFixed(4)),
      combinedScore: Number(item.combinedScore.toFixed(4)),
      isNeighbor: false,
      text: item.record.chunk.text,
    }));

    return {
      covered: false,
      bestScore,
      selected: [],
      debugChunks: previewTop,
    };
  }

  const topSeeds = scored.slice(0, MAX_TOP_CHUNKS);
  const chosenMap = new Map<
    string,
    {
      record: LoadedChunkRecord;
      cosineScore: number;
      keywordBoost: number;
      combinedScore: number;
      isNeighbor: boolean;
    }
  >();

  const scoreLookup = new Map<string, (typeof scored)[number]>();
  for (const s of scored) {
    scoreLookup.set(s.record.chunk.id, s);
  }

  let totalChars = 0;
  for (const seed of topSeeds) {
    if (totalChars + seed.record.chunk.text.length > MAX_CONTEXT_CHARS && chosenMap.size >= 3) {
      break;
    }
    chosenMap.set(seed.record.chunk.id, { ...seed, isNeighbor: false });
    totalChars += seed.record.chunk.text.length;
  }

  // Add immediate neighbors for step continuity
  for (const seed of topSeeds) {
    if (chosenMap.size >= MAX_TOTAL_CHUNKS) break;
    const docChunks = store.byDocId.get(seed.record.docId) || [];
    for (const offset of [-1, 1]) {
      if (chosenMap.size >= MAX_TOTAL_CHUNKS) break;
      const neighbor = docChunks[seed.record.chunkIndex + offset];
      if (!neighbor) continue;
      if (chosenMap.has(neighbor.chunk.id)) continue;
      if (totalChars + neighbor.chunk.text.length > MAX_CONTEXT_CHARS) continue;
      const neighborScore = scoreLookup.get(neighbor.chunk.id);
      chosenMap.set(neighbor.chunk.id, {
        record: neighbor,
        cosineScore: neighborScore?.cosineScore ?? 0,
        keywordBoost: neighborScore?.keywordBoost ?? 0,
        combinedScore: neighborScore?.combinedScore ?? 0,
        isNeighbor: true,
      });
      totalChars += neighbor.chunk.text.length;
    }
  }

  // Order by docId then chunkIndex so adjacent procedure steps stay in sequence
  const ordered = Array.from(chosenMap.values()).sort((a, bItem) => {
    if (a.record.docId !== bItem.record.docId) {
      return bItem.combinedScore - a.combinedScore;
    }
    return a.record.chunkIndex - bItem.record.chunkIndex;
  });

  const selected: TaggedRetrievedChunk[] = ordered.map((item, idx) => ({
    tag: `C${idx + 1}`,
    ...item,
  }));

  const debugChunks: DebugChunkInfo[] = selected.map((item) => ({
    tag: item.tag,
    id: item.record.chunk.id,
    docTitle: item.record.chunk.docTitle,
    revision: item.record.chunk.revision,
    chapter: item.record.chunk.chapter,
    section: item.record.chunk.section,
    pageStart: item.record.chunk.pageStart,
    pageEnd: item.record.chunk.pageEnd,
    cosineScore: Number(item.cosineScore.toFixed(4)),
    keywordBoost: Number(item.keywordBoost.toFixed(4)),
    combinedScore: Number(item.combinedScore.toFixed(4)),
    isNeighbor: item.isNeighbor,
    text: item.record.chunk.text,
  }));

  return {
    covered: true,
    bestScore,
    selected,
    debugChunks,
  };
}

export function buildNotCoveredAnswer(title: string, reason: string): StructuredAnswer {
  return {
    status: 'not_covered',
    title,
    critical_warnings: [],
    scope_summary: null,
    applies_to: [],
    prerequisites: [],
    materials_tools: [],
    hazards_ppe: [],
    steps: [],
    flowchart: null,
    tables: [],
    quality_checks: [],
    site_cleanup: [],
    exit_handover: [],
    records_reporting: [],
    not_specified: [reason],
    conflicts: [],
    related_sops: [],
    references: [],
  };
}

export function validateAndFinalizeAnswer(
  raw: Record<string, unknown>,
  retrieved: TaggedRetrievedChunk[]
): StructuredAnswer {
  const chunkByTag = new Map<string, TaggedRetrievedChunk>();
  for (const item of retrieved) {
    chunkByTag.set(item.tag, item);
  }

  const citedTags = new Set<string>();

  const filterSources = (sources: unknown): string[] => {
    if (!Array.isArray(sources)) return [];
    const valid: string[] = [];
    for (const s of sources) {
      if (typeof s !== 'string') continue;
      const normTag = s.trim().replace(/^\[|\]$/g, '');
      if (chunkByTag.has(normTag) && !valid.includes(normTag)) {
        valid.push(normTag);
        citedTags.add(normTag);
      }
    }
    return valid;
  };

  const cleanProse = (text: string): string =>
    text
      .replace(/\s*\[(?:C\d+(?:\s*,\s*C\d+)*)\]/gi, '')
      .replace(/\s*\((?:C\d+(?:\s*,\s*C\d+)*)\)/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

  const sanitizeSourcedTextList = (arr: unknown) => {
    if (!Array.isArray(arr)) return [];
    const out: Array<{ text: string; sources: string[] }> = [];
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const text = typeof rec.text === 'string' ? cleanProse(rec.text) : '';
      const sources = filterSources(rec.sources);
      if (text && sources.length > 0) {
        out.push({ text, sources });
      }
    }
    return out;
  };

  const critical_warnings = sanitizeSourcedTextList(raw.critical_warnings);
  const applies_to = sanitizeSourcedTextList(raw.applies_to);
  const prerequisites = sanitizeSourcedTextList(raw.prerequisites);
  const site_cleanup = sanitizeSourcedTextList(raw.site_cleanup);
  const exit_handover = sanitizeSourcedTextList(raw.exit_handover);
  const records_reporting = sanitizeSourcedTextList(raw.records_reporting);

  let scope_summary: StructuredAnswer['scope_summary'] = null;
  if (raw.scope_summary && typeof raw.scope_summary === 'object') {
    const ss = raw.scope_summary as Record<string, unknown>;
    const text = typeof ss.text === 'string' ? cleanProse(ss.text) : '';
    const sources = filterSources(ss.sources);
    if (text && sources.length > 0) {
      scope_summary = { text, sources };
    }
  }

  const materials_tools: StructuredAnswer['materials_tools'] = [];
  if (Array.isArray(raw.materials_tools)) {
    for (const entry of raw.materials_tools) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const item = typeof rec.item === 'string' ? cleanProse(rec.item) : '';
      const spec_qty = typeof rec.spec_qty === 'string' ? cleanProse(rec.spec_qty) : '';
      const rawType = typeof rec.type === 'string' ? rec.type : 'material';
      const type = (['material', 'tool', 'equipment', 'document'].includes(rawType)
        ? rawType
        : 'material') as 'material' | 'tool' | 'equipment' | 'document';
      const sources = filterSources(rec.sources);
      if (item && sources.length > 0) {
        materials_tools.push({ item, spec_qty, type, sources });
      }
    }
  }

  const hazards_ppe: StructuredAnswer['hazards_ppe'] = [];
  if (Array.isArray(raw.hazards_ppe)) {
    for (const entry of raw.hazards_ppe) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const item = typeof rec.item === 'string' ? cleanProse(rec.item) : '';
      const kind = rec.kind === 'ppe' ? 'ppe' : 'hazard';
      const sources = filterSources(rec.sources);
      if (item && sources.length > 0) {
        hazards_ppe.push({ item, kind, sources });
      }
    }
  }

  const steps: StructuredAnswer['steps'] = [];
  if (Array.isArray(raw.steps)) {
    for (const entry of raw.steps) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const action = typeof rec.action === 'string' ? cleanProse(rec.action) : '';
      const sources = filterSources(rec.sources);
      if (action && sources.length > 0) {
        steps.push({
          no: typeof rec.no === 'string' && rec.no.trim() ? rec.no.trim() : String(steps.length + 1),
          phase: typeof rec.phase === 'string' ? cleanProse(rec.phase) : '',
          action,
          details: typeof rec.details === 'string' ? cleanProse(rec.details) : '',
          caution: typeof rec.caution === 'string' ? cleanProse(rec.caution) : '',
          check: typeof rec.check === 'string' ? cleanProse(rec.check) : '',
          sources,
        });
      }
    }
  }

  const tables: StructuredAnswer['tables'] = [];
  if (Array.isArray(raw.tables)) {
    for (const entry of raw.tables) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const title = typeof rec.title === 'string' ? cleanProse(rec.title) : '';
      const headers = Array.isArray(rec.headers)
        ? rec.headers.map((h) => cleanProse(String(h ?? '')))
        : [];
      const rows = Array.isArray(rec.rows)
        ? rec.rows
            .filter((r) => Array.isArray(r))
            .map((r) => (r as unknown[]).map((c) => cleanProse(String(c ?? ''))))
        : [];
      const sources = filterSources(rec.sources);
      if (headers.length > 0 && rows.length > 0 && sources.length > 0) {
        tables.push({ title, headers, rows, sources });
      }
    }
  }

  const quality_checks: StructuredAnswer['quality_checks'] = [];
  if (Array.isArray(raw.quality_checks)) {
    for (const entry of raw.quality_checks) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const check = typeof rec.check === 'string' ? cleanProse(rec.check) : '';
      const criteria = typeof rec.criteria === 'string' ? cleanProse(rec.criteria) : '';
      const sources = filterSources(rec.sources);
      if (check && sources.length > 0) {
        quality_checks.push({ check, criteria, sources });
      }
    }
  }

  let flowchart: StructuredAnswer['flowchart'] = null;
  if (raw.flowchart && typeof raw.flowchart === 'object') {
    const fc = raw.flowchart as Record<string, unknown>;
    const rawNodes = Array.isArray(fc.nodes) ? fc.nodes : [];
    const rawEdges = Array.isArray(fc.edges) ? fc.edges : [];
    const nodes = rawNodes
      .filter((n) => n && typeof n === 'object')
      .map((n) => {
        const rec = n as Record<string, unknown>;
        const rawType = typeof rec.type === 'string' ? rec.type : 'step';
        const type = (['start', 'step', 'decision', 'end'].includes(rawType)
          ? rawType
          : 'step') as 'start' | 'step' | 'decision' | 'end';
        return {
          id: String(rec.id ?? '').trim(),
          label: cleanProse(String(rec.label ?? '')),
          type,
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
          label: cleanProse(String(rec.label ?? '')),
        };
      })
      .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

    if (nodes.length >= 2 && edges.length >= 1) {
      flowchart = { nodes, edges };
    }
  }

  const toStringArray = (val: unknown): string[] =>
    Array.isArray(val)
      ? val.map((v) => cleanProse(String(v ?? ''))).filter(Boolean)
      : [];

  const not_specified = toStringArray(raw.not_specified);
  const conflicts = toStringArray(raw.conflicts);
  const related_sops = toStringArray(raw.related_sops);

  // Build server-authoritative references strictly from cited retrieved chunks
  const refMap = new Map<string, AnswerReference>();
  const tagsToBuildRefs =
    citedTags.size > 0 ? Array.from(citedTags) : retrieved.map((r) => r.tag);

  for (const tag of tagsToBuildRefs) {
    const item = chunkByTag.get(tag);
    if (!item) continue;
    const c = item.record.chunk;
    const driveUrl = item.record.docMeta.driveUrl || undefined;
    const pages =
      c.pageStart === c.pageEnd ? `p. ${c.pageStart}` : `pp. ${c.pageStart}-${c.pageEnd}`;
    const chapterLabel =
      c.section && c.section !== c.chapter ? `${c.chapter} / ${c.section}` : c.chapter;
    const key = `${c.docTitle}|${c.revision}|${chapterLabel}|${pages}`;
    if (!refMap.has(key)) {
      refMap.set(key, {
        document: c.docTitle,
        revision: c.revision,
        chapter: chapterLabel,
        pages,
        ...(driveUrl ? { driveUrl } : {}),
      });
    }
  }

  const hasGroundedContent =
    critical_warnings.length > 0 ||
    Boolean(scope_summary) ||
    applies_to.length > 0 ||
    prerequisites.length > 0 ||
    materials_tools.length > 0 ||
    hazards_ppe.length > 0 ||
    steps.length > 0 ||
    tables.length > 0 ||
    quality_checks.length > 0 ||
    site_cleanup.length > 0 ||
    exit_handover.length > 0 ||
    records_reporting.length > 0;

  let status: StructuredAnswer['status'] =
    raw.status === 'answered' || raw.status === 'partially_covered' || raw.status === 'not_covered'
      ? raw.status
      : 'partially_covered';

  if (!hasGroundedContent) {
    status = 'not_covered';
  }

  return {
    status,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'SOP Procedure',
    critical_warnings,
    scope_summary,
    applies_to,
    prerequisites,
    materials_tools,
    hazards_ppe,
    steps,
    flowchart,
    tables,
    quality_checks,
    site_cleanup,
    exit_handover,
    records_reporting,
    not_specified,
    conflicts,
    related_sops,
    references: hasGroundedContent ? Array.from(refMap.values()) : [],
  };
}
