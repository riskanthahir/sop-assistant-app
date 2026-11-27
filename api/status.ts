import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleStatusRequest } from '../lib/chatHandler.ts';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleStatusRequest(req, res);
}
