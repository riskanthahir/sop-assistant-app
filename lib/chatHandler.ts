import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkRateLimit, getClientIp, isAccessConfigured, verifyAccessCode } from './auth.ts';
import { embedQueryText, generateSopAnswer } from './gemini.ts';
import {
  buildNotCoveredAnswer,
  getSopStore,
  searchSopChunks,
  validateAndFinalizeAnswer,
} from './rag.ts';
import type { AppStatusResponse, ChatStreamEvent, Language } from './types.ts';

function readJsonBody(req: IncomingMessage & { body?: unknown }): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body as Record<string, unknown>);
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > 256_000) {
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function writeNdjson(res: ServerResponse, event: ChatStreamEvent) {
  res.write(JSON.stringify(event) + '\n');
}

export async function handleStatusRequest(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const store = await getSopStore();
  const minScore = Number(process.env.MIN_SCORE || '0.42');
  const payload: AppStatusResponse = {
    appName: process.env.APP_NAME?.trim() || 'SOP Assistant',
    reportUrl: process.env.REPORT_URL?.trim() || '',
    accessConfigured: isAccessConfigured(),
    docsCount: store.index.docs.length,
    docs: store.index.docs.map((d) => ({
      docId: d.docId,
      docTitle: d.docTitle,
      revision: d.revision,
      effectiveDate: d.effectiveDate,
      pageCount: d.pageCount,
      chunkCount: d.chunkCount,
    })),
    minScore: Number.isFinite(minScore) ? minScore : 0.42,
  };
  sendJson(res, 200, payload);
}

export async function handleVerifyAccessRequest(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'Method not allowed' });
    return;
  }

  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec || 60));
    sendJson(res, 429, { ok: false, message: 'Too many requests. Please wait and try again.' });
    return;
  }

  let body: Record<string, unknown> = {};
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, message: 'Invalid JSON body' });
    return;
  }

  const headerCode = req.headers['x-access-code'];
  const code =
    typeof body.accessCode === 'string'
      ? body.accessCode
      : Array.isArray(headerCode)
      ? headerCode[0]
      : headerCode;

  const check = verifyAccessCode(code);
  sendJson(res, check.statusCode, {
    ok: check.ok,
    configured: check.configured,
    message: check.message,
  });
}

function getNotCoveredCopy(lang: Language, noDocs: boolean): { title: string; reason: string } {
  if (noDocs) {
    if (lang === 'si') {
      return {
        title: 'SOP ලේඛන කිසිවක් සුචිගත කර නැත',
        reason: 'දැනට ක්‍රියාකාරී SOP PDF ලේඛන කිසිවක් සුචිගත කර නොමැත. /sops වෙත SOP PDF එක් කර ingest ක්‍රියාවලිය ධාවනය කරන්න.',
      };
    }
    if (lang === 'ta') {
      return {
        title: 'SOP ஆவணங்கள் இன்னும் அட்டவணைப்படுத்தப்படவில்லை',
        reason: 'தற்போது செயலில் உள்ள SOP PDF ஆவணங்கள் எதுவும் இல்லை. /sops கோப்புறையில் SOP PDF களைச் சேர்த்து ingest இயக்கவும்.',
      };
    }
    return {
      title: 'No SOP documents indexed yet',
      reason: 'No active SOP PDFs have been indexed yet. Add SOP PDF files to /sops and run the ingest workflow.',
    };
  }

  if (lang === 'si') {
    return {
      title: 'SOP ලේඛනවල මෙම කරුණ ආවරණය නොවේ',
      reason: 'ලබා දී ඇති ප්‍රශ්නයට ගැළපෙන තොරතුරු අපගේ ක්‍රියාකාරී SOP PDF ලේඛනවලින් හමු නොවීය.',
    };
  }
  if (lang === 'ta') {
    return {
      title: 'SOP ஆவணங்களில் இது உள்ளடக்கப்படவில்லை',
      reason: 'உங்கள் கேள்விக்குப் பொருத்தமான தகவல் எமது செயலில் உள்ள SOP PDF ஆவணங்களில் இல்லை.',
    };
  }
  return {
    title: 'Not covered in current SOPs',
    reason: 'The indexed active SOP documents do not contain matching procedure details for this question.',
  };
}

export async function handleChatRequest(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const access = verifyAccessCode(req.headers['x-access-code']);
  if (!access.ok) {
    sendJson(res, access.statusCode, { error: access.message });
    return;
  }

  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec || 60));
    sendJson(res, 429, { error: 'Rate limit exceeded. Please wait briefly before sending another question.' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const previousQuestion =
    typeof body.previousQuestion === 'string' ? body.previousQuestion.trim() : '';
  const rawLang = typeof body.language === 'string' ? body.language : 'en';
  const language: Language = rawLang === 'si' || rawLang === 'ta' ? rawLang : 'en';
  const includeDebug = body.includeDebug === true;

  if (!question) {
    sendJson(res, 400, { error: 'Question is required.' });
    return;
  }
  if (question.length > 1000) {
    sendJson(res, 400, { error: 'Question is too long (max 1000 characters).' });
    return;
  }

  const envMinScore = Number(process.env.MIN_SCORE || '0.42');
  const requestedMinScore =
    includeDebug && typeof body.minScoreOverride === 'number' && Number.isFinite(body.minScoreOverride)
      ? Math.max(0, Math.min(1, body.minScoreOverride))
      : Number.isFinite(envMinScore)
      ? envMinScore
      : 0.42;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    writeNdjson(res, { type: 'stage', stage: 'searching' });

    const store = await getSopStore();

    if (store.records.length === 0) {
      const copy = getNotCoveredCopy(language, true);
      writeNdjson(res, { type: 'stage', stage: 'done' });
      writeNdjson(res, {
        type: 'result',
        answer: buildNotCoveredAnswer(copy.title, copy.reason),
        ...(includeDebug
          ? {
              debug: {
                query: question,
                expandedQuery: question,
                minScore: requestedMinScore,
                bestScore: 0,
                aboveThreshold: false,
                docsIndexed: 0,
                retrievedChunks: [],
                rawModelOutput: null,
              },
            }
          : {}),
      });
      res.end();
      return;
    }

    // Combine very short follow-up questions with previous user question for retrieval context
    const wordCount = question.split(/\s+/).filter(Boolean).length;
    const isShortFollowUp = (question.length < 24 || wordCount <= 4) && previousQuestion.length > 0;
    const retrievalQuery = isShortFollowUp
      ? `${previousQuestion}\nFollow-up: ${question}`
      : question;

    const queryVector = await embedQueryText(retrievalQuery);
    const searchResult = searchSopChunks(store, retrievalQuery, queryVector, requestedMinScore);

    if (!searchResult.covered) {
      const copy = getNotCoveredCopy(language, false);
      writeNdjson(res, { type: 'stage', stage: 'done' });
      writeNdjson(res, {
        type: 'result',
        answer: buildNotCoveredAnswer(copy.title, copy.reason),
        ...(includeDebug
          ? {
              debug: {
                query: question,
                expandedQuery: retrievalQuery,
                minScore: requestedMinScore,
                bestScore: Number(searchResult.bestScore.toFixed(4)),
                aboveThreshold: false,
                docsIndexed: store.index.docs.length,
                retrievedChunks: searchResult.debugChunks,
                rawModelOutput: null,
              },
            }
          : {}),
      });
      res.end();
      return;
    }

    writeNdjson(res, { type: 'stage', stage: 'writing' });

    const { parsed, rawText } = await generateSopAnswer({
      question: retrievalQuery,
      language,
      chunks: searchResult.selected,
      glossary: store.glossary,
    });

    const validatedAnswer = validateAndFinalizeAnswer(parsed, searchResult.selected);

    writeNdjson(res, { type: 'stage', stage: 'done' });
    writeNdjson(res, {
      type: 'result',
      answer: validatedAnswer,
      ...(includeDebug
        ? {
            debug: {
              query: question,
              expandedQuery: retrievalQuery,
              minScore: requestedMinScore,
              bestScore: Number(searchResult.bestScore.toFixed(4)),
              aboveThreshold: true,
              docsIndexed: store.index.docs.length,
              retrievedChunks: searchResult.debugChunks,
              rawModelOutput: rawText,
            },
          }
        : {}),
    });
    res.end();
  } catch (err) {
    console.error('Chat pipeline error:', err);
    const msg = (err as Error)?.message || 'Failed to process SOP query.';
    writeNdjson(res, {
      type: 'error',
      error: msg,
    });
    res.end();
  }
}
