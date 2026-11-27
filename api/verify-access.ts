import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleVerifyAccessRequest } from '../lib/chatHandler.ts';

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  await handleVerifyAccessRequest(req, res);
}
