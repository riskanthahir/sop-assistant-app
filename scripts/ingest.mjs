import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import 'dotenv/config';

const ROOT_DIR = process.cwd();
const SOPS_DIR = path.join(ROOT_DIR, 'sops');
const DATA_DOCS_DIR = path.join(ROOT_DIR, 'data', 'docs');
const CACHE_DIR = path.join(DATA_DOCS_DIR, '.cache');
const REPORT_PATH = path.join(ROOT_DIR, 'data', 'ingest-report.md');
const INDEX_PATH = path.join(DATA_DOCS_DIR, 'index.json');
const MANIFEST_PATH = path.join(SOPS_DIR, 'manifest.json');

const EMBED_MODEL = process.env.EMBED_MODEL?.trim() || 'gemini-embedding-2';
const EMBED_DIM = 768;
const TARGET_CHARS = 2400; // ~600 tokens
const MAX_CHARS = 3200; // ~800 tokens
const MIN_CHARS = 1800; // ~450-500 tokens
const OVERLAP_RATIO = 0.12;
const BATCH_SIZE = 16;
const BATCH_DELAY_MS = 1200;
const CHUNK_PIPELINE_VERSION = 'v1';

// Configure pdfjs worker cleanly for Node 20+
const workerPath = path.resolve(ROOT_DIR, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sanitizeDocId(relPath) {
  return relPath
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function parseFilenameMetadata(filename) {
  const base = path.basename(filename, path.extname(filename));
  let revision = 'Rev 1';
  let effectiveDate = 'Unspecified';
  let title = base;

  const revMatch = base.match(/(?:^|[_\-\s])(rev[\s._-]?\d+(?:\.\d+)?|v\d+(?:\.\d+)?)/i);
  if (revMatch) {
    revision = revMatch[1].replace(/[_\-]+/g, ' ').trim();
    title = title.replace(revMatch[0], ' ');
  }

  const dateMatch = base.match(/(?:^|[_\-\s])(20\d{2}[-_.]\d{2}(?:[-_.]\d{2})?)/);
  if (dateMatch) {
    effectiveDate = dateMatch[1].replace(/[_.]/g, '-');
    title = title.replace(dateMatch[0], ' ');
  }

  title = title.replace(/[_\s]+/g, ' ').replace(/[-_]+$/g, '').trim() || base;
  return { title, revision, effectiveDate };
}

async function listPdfFiles(dir, baseDir = dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listPdfFiles(fullPath, baseDir)));
    } else if (entry.isFile() && /\.pdf$/i.test(entry.name)) {
      files.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  }
  return files.sort();
}

async function loadManifest() {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findManifestEntry(manifest, relPath) {
  const base = path.basename(relPath);
  return (
    manifest.find((m) => m.file === relPath) ||
    manifest.find((m) => m.file && path.basename(m.file) === base) ||
    null
  );
}

async function sha256File(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isNumberedHeading(text) {
  return (
    /^(\d+(?:\.\d+){0,3})\s+[A-Z0-9][^\n]{2,90}$/.test(text) ||
    /^(?:chapter|section|annex|appendix)\s+[A-Z0-9]+(?:\s*[:.\-]\s*|\s+)[^\n]{2,90}$/i.test(text)
  );
}

function isTopLevelHeading(text) {
  return (
    /^(\d+\.?)\s+[A-Z][^\n]{2,80}$/.test(text) ||
    /^(?:chapter|section|annex|appendix)\s+[A-Z0-9]+/i.test(text)
  );
}

function isStepStart(line) {
  return /^(?:\d{1,3}[.)]\s+|step\s+\d{1,3}\b|[a-z][.)]\s+)/i.test(line.trim());
}

/**
 * Extract structured lines from a single PDF page, preserving table rows with " | "
 * and font size / bold metadata for heading detection.
 */
function extractPageLines(textContent) {
  const styles = textContent.styles || {};
  const rawItems = [];

  for (const item of textContent.items || []) {
    if (!item || typeof item.str !== 'string') continue;
    const str = item.str.replace(/\s+/g, ' ');
    if (!str.trim()) continue;
    const transform = item.transform || [1, 0, 0, 12, 0, 0];
    const fontSize = Math.max(Math.abs(transform[0] || 0), Math.abs(transform[3] || 0), item.height || 10);
    const x = transform[4] || 0;
    const y = transform[5] || 0;
    const style = styles[item.fontName] || {};
    const fontFamily = `${style.fontFamily || ''} ${item.fontName || ''}`.toLowerCase();
    const isBold = /bold|black|heavy|demi|semibold/.test(fontFamily);
    rawItems.push({ str, x, y, width: item.width || 0, fontSize, isBold });
  }

  if (rawItems.length === 0) {
    return { lines: [], medianFontSize: 10, charCount: 0 };
  }

  // Group into rows by Y coordinate (tolerance 3.5pt)
  rawItems.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const item of rawItems) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow.y - item.y) <= 3.5) {
      lastRow.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  const fontSizes = rawItems.map((i) => i.fontSize).sort((a, b) => a - b);
  const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 10;

  const lines = [];
  let charCount = 0;

  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    let lineText = '';
    let prevEnd = null;
    let maxFont = 0;
    let boldChars = 0;
    let totalChars = 0;
    let columnCount = 1;

    for (const item of row.items) {
      const trimmed = item.str.trim();
      if (!trimmed) continue;
      maxFont = Math.max(maxFont, item.fontSize);
      totalChars += trimmed.length;
      if (item.isBold) boldChars += trimmed.length;

      if (prevEnd !== null) {
        const gap = item.x - prevEnd;
        const colThreshold = Math.max(item.fontSize * 1.8, 16);
        if (gap > colThreshold) {
          lineText += ' | ';
          columnCount += 1;
        } else if (gap > 1.5 && !lineText.endsWith(' ')) {
          lineText += ' ';
        }
      }
      lineText += trimmed;
      prevEnd = item.x + item.width;
    }

    const clean = lineText.replace(/\s*\|\s*/g, ' | ').replace(/\s{2,}/g, ' ').trim();
    if (!clean) continue;
    charCount += clean.length;
    lines.push({
      text: clean,
      maxFont,
      isBold: totalChars > 0 && boldChars / totalChars >= 0.65,
      isTableRow: columnCount >= 2,
    });
  }

  return { lines, medianFontSize, charCount };
}

/**
 * Extract all pages from one PDF sequentially to keep memory bounded.
 */
async function extractPdfPages(pdfPath) {
  const bytes = new Uint8Array(await fs.readFile(pdfPath));
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages;
  const pages = [];
  const lowTextPages = [];
  const headingsFound = [];

  let currentChapter = 'General';
  let currentSection = 'Overview';

  try {
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      try {
        const textContent = await page.getTextContent({ includeMarkedContent: false });
        const { lines, medianFontSize, charCount } = extractPageLines(textContent);

        if (charCount < 40) {
          lowTextPages.push(pageNum);
        }

        const taggedLines = [];
        for (const line of lines) {
          const t = line.text;
          const looksLikeHeading =
            !line.isTableRow &&
            t.length >= 3 &&
            t.length <= 100 &&
            (isNumberedHeading(t) ||
              line.maxFont >= medianFontSize * 1.2 ||
              (line.isBold && line.maxFont >= medianFontSize * 1.04 && !/[.;,]$/.test(t)));

          if (looksLikeHeading) {
            if (isTopLevelHeading(t) || line.maxFont >= medianFontSize * 1.32) {
              currentChapter = t;
              currentSection = t;
            } else {
              currentSection = t;
            }
            if (!headingsFound.includes(t)) {
              headingsFound.push(t);
            }
          }

          taggedLines.push({
            text: t,
            page: pageNum,
            chapter: currentChapter,
            section: currentSection,
            isHeading: looksLikeHeading,
          });
        }

        pages.push({ pageNum, lines: taggedLines, charCount });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdfDoc.destroy();
  }

  return { pageCount, pages, lowTextPages, headingsFound };
}

/**
 * Group tagged lines into atomic blocks (keeping numbered steps together) and chunk to 500-800 tokens (~2000-3200 chars) with ~12% overlap.
 */
function buildChunks(pages, meta) {
  const allLines = pages.flatMap((p) => p.lines);
  if (allLines.length === 0) return [];

  // Build blocks so numbered step items stay intact
  const blocks = [];
  let currentBlock = null;

  for (const line of allLines) {
    const startsStep = isStepStart(line.text);
    const shouldStartNew =
      !currentBlock ||
      line.isHeading ||
      startsStep ||
      currentBlock.chapter !== line.chapter ||
      currentBlock.section !== line.section ||
      currentBlock.text.length > 900;

    if (shouldStartNew) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        text: line.text,
        pageStart: line.page,
        pageEnd: line.page,
        chapter: line.chapter,
        section: line.section,
      };
    } else {
      currentBlock.text += '\n' + line.text;
      currentBlock.pageEnd = line.page;
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  const chunks = [];
  let bufferBlocks = [];
  let bufferLen = 0;

  const flushChunk = () => {
    if (bufferBlocks.length === 0) return;
    const text = bufferBlocks.map((b) => b.text).join('\n').trim();
    if (!text) return;
    const first = bufferBlocks[0];
    const last = bufferBlocks[bufferBlocks.length - 1];
    const chunkIndex = chunks.length;
    chunks.push({
      id: `${meta.docId}#c${chunkIndex}`,
      docId: meta.docId,
      docTitle: meta.docTitle,
      revision: meta.revision,
      effectiveDate: meta.effectiveDate,
      pageStart: first.pageStart,
      pageEnd: last.pageEnd,
      chapter: last.chapter || first.chapter,
      section: last.section || first.section,
      text,
    });

    // ~12% overlap from trailing blocks
    const overlapTarget = Math.round(text.length * OVERLAP_RATIO);
    const nextOverlap = [];
    let overlapLen = 0;
    for (let i = bufferBlocks.length - 1; i >= 0; i--) {
      const b = bufferBlocks[i];
      if (overlapLen + b.text.length > overlapTarget * 1.4 && nextOverlap.length > 0) break;
      nextOverlap.unshift(b);
      overlapLen += b.text.length;
      if (overlapLen >= overlapTarget) break;
    }
    // Avoid keeping the entire chunk if only 1 giant block existed
    if (nextOverlap.length === bufferBlocks.length && bufferBlocks.length === 1) {
      bufferBlocks = [];
      bufferLen = 0;
    } else {
      bufferBlocks = nextOverlap;
      bufferLen = overlapLen;
    }
  };

  for (const block of blocks) {
    const sameChapter =
      bufferBlocks.length === 0 || bufferBlocks[bufferBlocks.length - 1].chapter === block.chapter;

    if (!sameChapter && bufferLen >= MIN_CHARS * 0.5) {
      flushChunk();
    }

    if (bufferLen + block.text.length > MAX_CHARS && bufferLen >= MIN_CHARS * 0.6) {
      flushChunk();
    }

    bufferBlocks.push(block);
    bufferLen += block.text.length + 1;

    if (bufferLen >= TARGET_CHARS) {
      flushChunk();
    }
  }
  if (bufferBlocks.length > 0) {
    // Avoid trailing tiny duplicate if identical to end of previous chunk
    const candidateText = bufferBlocks.map((b) => b.text).join('\n').trim();
    const prev = chunks[chunks.length - 1];
    if (!prev || !prev.text.endsWith(candidateText)) {
      flushChunk();
    }
  }

  return chunks;
}

class QuotaExhaustedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuotaExhaustedError';
  }
}

async function embedBatchWithRetry(ai, texts) {
  const maxRetries = 5;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await ai.models.embedContent({
        model: EMBED_MODEL,
        contents: texts,
        config: {
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: EMBED_DIM,
        },
      });
      const vectors = (res.embeddings || []).map((e) => e.values || []);
      if (vectors.length !== texts.length) {
        throw new Error(`Expected ${texts.length} embeddings, got ${vectors.length}`);
      }
      return vectors;
    } catch (err) {
      const status = err?.status || err?.code || 0;
      const msg = String(err?.message || err || '');
      const isRetryable =
        status === 429 ||
        status >= 500 ||
        /429|RESOURCE_EXHAUSTED|quota|rate|503|500|ETIMEDOUT|ECONNRESET/i.test(msg);

      if (!isRetryable) throw err;
      if (attempt === maxRetries) {
        if (status === 429 || /429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
          throw new QuotaExhaustedError(msg);
        }
        throw err;
      }
      const backoff = Math.min(30000, 1500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 600);
      console.warn(`Embedding retry ${attempt + 1}/${maxRetries} after ${backoff}ms: ${msg}`);
      await sleep(backoff);
    }
  }
}

async function readExistingIndex() {
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.docs) ? parsed : { docs: [] };
  } catch {
    return { docs: [] };
  }
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeReport(reportRows) {
  const now = new Date().toISOString();
  const lines = [
    '# SOP Ingest Report',
    '',
    `Generated: ${now}  `,
    `Embedding model: \`${EMBED_MODEL}\` (${EMBED_DIM} dimensions)`,
    '',
    '| Document | Status | Pages | Chunks | Headings | Low-Text Pages (Possible Scan) | Notes / Errors |',
    '| --- | --- | ---: | ---: | ---: | --- | --- |',
  ];

  if (reportRows.length === 0) {
    lines.push('| *(none)* | - | 0 | 0 | 0 | - | No PDF files found in `/sops`. |');
  } else {
    for (const r of reportRows) {
      const lowPages = r.lowTextPages?.length ? r.lowTextPages.join(', ') : 'None';
      const notes = (r.error || r.note || 'OK').replace(/\|/g, '/').replace(/\n/g, ' ');
      lines.push(
        `| ${r.file} (${r.revision || '-'}) | ${r.status} | ${r.pageCount ?? 0} | ${r.chunkCount ?? 0} | ${r.headingCount ?? 0} | ${lowPages} | ${notes} |`
      );
    }
  }

  lines.push('');
  for (const r of reportRows) {
    if (r.headings && r.headings.length > 0) {
      lines.push(`### ${r.docTitle || r.file}`);
      lines.push(`Headings detected (${r.headings.length}): ${r.headings.slice(0, 25).join(' · ')}${r.headings.length > 25 ? ' ...' : ''}`);
      lines.push('');
    }
  }

  await fs.writeFile(REPORT_PATH, lines.join('\n') + '\n', 'utf8');
}

async function main() {
  await fs.mkdir(SOPS_DIR, { recursive: true });
  await fs.mkdir(DATA_DOCS_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const pdfRelPaths = await listPdfFiles(SOPS_DIR);
  const manifest = await loadManifest();
  const existingIndex = await readExistingIndex();
  const existingById = new Map((existingIndex.docs || []).map((d) => [d.docId, d]));

  const reportRows = [];
  const activeDocs = [];
  const activeDocIds = new Set();
  let quotaStopped = false;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const ai = apiKey
    ? new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      })
    : null;

  for (const relPath of pdfRelPaths) {
    const fullPath = path.join(SOPS_DIR, relPath);
    const docId = sanitizeDocId(relPath);
    const manifestEntry = findManifestEntry(manifest, relPath);
    const parsedName = parseFilenameMetadata(relPath);

    const status = manifestEntry?.status === 'superseded' ? 'superseded' : 'active';
    const docTitle = manifestEntry?.title || parsedName.title;
    const revision = manifestEntry?.revision || parsedName.revision;
    const effectiveDate = manifestEntry?.effectiveDate || parsedName.effectiveDate;
    const driveUrl = manifestEntry?.driveUrl || '';

    if (status === 'superseded') {
      // Remove any stale output for superseded docs
      await fs.rm(path.join(DATA_DOCS_DIR, `${docId}.json`), { force: true });
      await fs.rm(path.join(DATA_DOCS_DIR, `${docId}.bin`), { force: true });
      await fs.rm(path.join(CACHE_DIR, `${docId}.partial.json`), { force: true });
      reportRows.push({
        file: relPath,
        docTitle,
        revision,
        status: 'superseded (excluded)',
        pageCount: 0,
        chunkCount: 0,
        headingCount: 0,
        lowTextPages: [],
        note: 'Excluded because manifest status is superseded',
      });
      continue;
    }

    activeDocIds.add(docId);

    const fileHash = await sha256File(fullPath);
    const metaSignature = crypto
      .createHash('sha256')
      .update(`${fileHash}|${docTitle}|${revision}|${effectiveDate}|${driveUrl}|${EMBED_MODEL}|${CHUNK_PIPELINE_VERSION}`)
      .digest('hex');

    const outJsonPath = path.join(DATA_DOCS_DIR, `${docId}.json`);
    const outBinPath = path.join(DATA_DOCS_DIR, `${docId}.bin`);
    const prevDoc = existingById.get(docId);

    if (
      prevDoc &&
      prevDoc.metaSignature === metaSignature &&
      (await fileExists(outJsonPath)) &&
      (await fileExists(outBinPath))
    ) {
      activeDocs.push(prevDoc);
      reportRows.push({
        file: relPath,
        docTitle,
        revision,
        status: 'cached (unchanged)',
        pageCount: prevDoc.pageCount,
        chunkCount: prevDoc.chunkCount,
        headingCount: prevDoc.headingCount || 0,
        lowTextPages: prevDoc.lowTextPages || [],
        headings: [],
        note: 'Skipped embedding (file hash unchanged)',
      });
      continue;
    }

    if (quotaStopped) {
      if (prevDoc && (await fileExists(outJsonPath)) && (await fileExists(outBinPath))) {
        activeDocs.push(prevDoc);
      }
      reportRows.push({
        file: relPath,
        docTitle,
        revision,
        status: 'deferred (quota)',
        pageCount: 0,
        chunkCount: 0,
        headingCount: 0,
        lowTextPages: [],
        note: 'Deferred after earlier quota stop; re-run to resume',
      });
      continue;
    }

    if (!ai) {
      reportRows.push({
        file: relPath,
        docTitle,
        revision,
        status: 'error',
        pageCount: 0,
        chunkCount: 0,
        headingCount: 0,
        lowTextPages: [],
        error: 'GEMINI_API_KEY is missing',
      });
      continue;
    }

    console.log(`Processing ${relPath}...`);
    const partialPath = path.join(CACHE_DIR, `${docId}.partial.json`);
    let partial = null;
    try {
      const rawPartial = await fs.readFile(partialPath, 'utf8');
      const parsedPartial = JSON.parse(rawPartial);
      if (parsedPartial.metaSignature === metaSignature && Array.isArray(parsedPartial.chunks)) {
        partial = parsedPartial;
        console.log(`Resuming ${relPath} from chunk ${partial.embeddings.length}/${partial.chunks.length}`);
      }
    } catch {
      // No valid partial cache
    }

    try {
      if (!partial) {
        const extracted = await extractPdfPages(fullPath);
        const chunks = buildChunks(extracted.pages, {
          docId,
          docTitle,
          revision,
          effectiveDate,
        });
        partial = {
          metaSignature,
          fileHash,
          pageCount: extracted.pageCount,
          lowTextPages: extracted.lowTextPages,
          headingsFound: extracted.headingsFound,
          chunks,
          embeddings: [],
        };
        await fs.writeFile(partialPath, JSON.stringify(partial), 'utf8');
      }

      const { chunks } = partial;
      for (let i = partial.embeddings.length; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const texts = batch.map((c) => `${c.docTitle} | ${c.chapter} | ${c.section}\n${c.text}`);
        const vectors = await embedBatchWithRetry(ai, texts);
        partial.embeddings.push(...vectors);
        await fs.writeFile(partialPath, JSON.stringify(partial), 'utf8');
        console.log(`  Embedded ${partial.embeddings.length}/${chunks.length} chunks for ${relPath}`);
        if (i + BATCH_SIZE < chunks.length) {
          await sleep(BATCH_DELAY_MS);
        }
      }

      // Write final per-document JSON and Float32 binary embeddings
      const docPayload = {
        docId,
        file: relPath,
        docTitle,
        revision,
        effectiveDate,
        driveUrl,
        pageCount: partial.pageCount,
        chunks,
      };
      await fs.writeFile(outJsonPath, JSON.stringify(docPayload), 'utf8');

      const floatArray = new Float32Array(chunks.length * EMBED_DIM);
      for (let c = 0; c < chunks.length; c++) {
        const vec = partial.embeddings[c] || [];
        for (let d = 0; d < EMBED_DIM; d++) {
          floatArray[c * EMBED_DIM + d] = vec[d] || 0;
        }
      }
      await fs.writeFile(outBinPath, Buffer.from(floatArray.buffer));
      await fs.rm(partialPath, { force: true });

      const indexEntry = {
        docId,
        file: relPath,
        docTitle,
        revision,
        effectiveDate,
        driveUrl,
        fileHash,
        metaSignature,
        pageCount: partial.pageCount,
        chunkCount: chunks.length,
        headingCount: partial.headingsFound.length,
        lowTextPages: partial.lowTextPages,
      };
      activeDocs.push(indexEntry);

      reportRows.push({
        file: relPath,
        docTitle,
        revision,
        status: 'indexed',
        pageCount: partial.pageCount,
        chunkCount: chunks.length,
        headingCount: partial.headingsFound.length,
        lowTextPages: partial.lowTextPages,
        headings: partial.headingsFound,
        note: partial.lowTextPages.length > 0 ? 'Some pages had very little text (possible scans)' : 'OK',
      });
    } catch (err) {
      if (err instanceof QuotaExhaustedError) {
        quotaStopped = true;
        if (prevDoc && (await fileExists(outJsonPath)) && (await fileExists(outBinPath))) {
          activeDocs.push(prevDoc);
        }
        reportRows.push({
          file: relPath,
          docTitle,
          revision,
          status: 'paused (quota)',
          pageCount: partial?.pageCount || 0,
          chunkCount: partial?.embeddings?.length || 0,
          headingCount: partial?.headingsFound?.length || 0,
          lowTextPages: partial?.lowTextPages || [],
          error: `Quota reached at ${partial?.embeddings?.length || 0}/${partial?.chunks?.length || '?'} chunks. Partial progress saved; re-run to resume.`,
        });
      } else {
        reportRows.push({
          file: relPath,
          docTitle,
          revision,
          status: 'error',
          pageCount: partial?.pageCount || 0,
          chunkCount: 0,
          headingCount: 0,
          lowTextPages: partial?.lowTextPages || [],
          error: err?.message || String(err),
        });
      }
    }
  }

  // Remove orphaned data files for deleted PDFs
  const existingFiles = await fs.readdir(DATA_DOCS_DIR);
  for (const f of existingFiles) {
    if (f === 'index.json' || f === '.cache') continue;
    const match = f.match(/^(.+)\.(json|bin)$/);
    if (match && !activeDocIds.has(match[1])) {
      await fs.rm(path.join(DATA_DOCS_DIR, f), { force: true });
      console.log(`Removed stale data file for deleted/superseded SOP: ${f}`);
    }
  }

  // Clean empty .cache dir if no partial files remain
  try {
    const cacheFiles = await fs.readdir(CACHE_DIR);
    if (cacheFiles.length === 0) {
      await fs.rmdir(CACHE_DIR);
    }
  } catch {
    // ignore
  }

  const nextIndex = {
    generatedAt: new Date().toISOString(),
    embedModel: EMBED_MODEL,
    dimensions: EMBED_DIM,
    docs: activeDocs.sort((a, b) => a.docTitle.localeCompare(b.docTitle)),
  };
  await fs.writeFile(INDEX_PATH, JSON.stringify(nextIndex, null, 2) + '\n', 'utf8');
  await writeReport(reportRows);

  const reportContent = await fs.readFile(REPORT_PATH, 'utf8');
  console.log('\n' + reportContent);

  if (quotaStopped) {
    console.error('Ingest paused due to Gemini API quota limit. Partial progress saved. Re-run to continue.');
    process.exitCode = 2;
  } else if (reportRows.some((r) => r.status === 'error')) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal ingest error:', err);
  process.exit(1);
});
