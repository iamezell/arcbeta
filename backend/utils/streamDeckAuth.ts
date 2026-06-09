import { Request, Response, NextFunction } from 'express';

// Pull the shared admit/director token from wherever a Stream Deck HTTP plugin
// is able to put it: header, bearer auth, JSON body, or query string.
export function extractToken(req: Request): string | undefined {
  const header = req.get('x-admit-token') || req.get('x-arc-token');
  if (header) return header.trim();

  const auth = req.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  const fromBody = (req.body && (req.body.token || req.body.admitToken)) as string | undefined;
  if (fromBody) return String(fromBody).trim();

  const fromQuery = (req.query.token || req.query.admitToken) as string | undefined;
  if (fromQuery) return String(fromQuery).trim();

  return undefined;
}

// Express middleware guarding Stream Deck endpoints with STREAM_DECK_TOKEN.
export function requireStreamDeckToken(req: Request, res: Response, next: NextFunction): void {
  const expectedToken = process.env.STREAM_DECK_TOKEN;
  if (!expectedToken) {
    console.error('STREAM_DECK_TOKEN is not configured; refusing request');
    res.status(503).json({ error: 'Endpoint is not configured' });
    return;
  }
  const providedToken = extractToken(req);
  if (!providedToken || providedToken !== expectedToken) {
    res.status(401).json({ error: 'Invalid or missing token' });
    return;
  }
  next();
}
