// Local server for the Vercel functions in /api (used by `npm run dev:dynamic`; Vite proxies /api here).
// Requires DATABASE_URL and CREDENTIALS_KEY in the environment (see .env.example).
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.API_PORT) || 3001;
const routes = ['config', 'login', 'suppliers', 'items', 'orders', 'prices', 'strategies', 'purchase-orders', 'sales-channels', 'stock-check', 'delivery-restrictions', 'item-features'];

createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  if (!routes.includes(name)) {
    res.writeHead(404).end();
    return;
  }
  const mod: Record<string, (r: Request) => Promise<Response>> = await import(`../api/${name}.ts`);
  const handler = mod[req.method || 'GET'];
  if (!handler) {
    res.writeHead(405).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : Buffer.concat(chunks),
  });
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => console.log(`API on http://localhost:${PORT}/api`));
