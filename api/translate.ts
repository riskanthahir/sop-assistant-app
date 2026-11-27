import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleTranslateRequest } from '../lib/chatHandler.ts';

export const maxDuration = 60;

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  await handleTranslateRequest(req, res);
}
