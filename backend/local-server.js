import { createServer } from 'node:http';

process.env.LOCAL_DEV = '1';
const { handler } = await import('./handler.js');
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const url = new URL(request.url, 'http://localhost:8787');
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-allow-headers': 'authorization,content-type' });
    response.end(); return;
  }
  const result = await handler({ rawPath: url.pathname, queryStringParameters: Object.fromEntries(url.searchParams), body: Buffer.concat(chunks).toString('utf8'), requestContext: { http: { method: request.method, sourceIp: request.socket.remoteAddress } } });
  response.writeHead(result.statusCode, result.headers);
  response.end(result.body);
});
const port = Number(process.env.PORT || 8788);
server.listen(port, '127.0.0.1', () => process.stdout.write(`SkillBridge local API listening on http://127.0.0.1:${port}\n`));
