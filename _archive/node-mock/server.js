const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Payload too large'));
      }
    });

    req.on('end', () => {
      try {
        const body = raw ? JSON.parse(raw) : {};
        resolve(body);
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function runMockAutomation(input) {
  const cleaned = String(input || '').trim();
  const summary = cleaned
    ? cleaned.split(/\s+/).slice(0, 20).join(' ')
    : 'No content provided';

  return {
    status: 'success',
    workflow: 'mock-document-automation-v1',
    output: {
      title: cleaned ? 'Automated Draft' : 'Empty Document',
      summary,
      actions: [
        'Extracted key phrases',
        'Generated short summary',
        'Prepared next-step checklist'
      ],
      nextSteps: [
        'Connect a real LLM provider',
        'Add file upload parsing',
        'Persist results to a database'
      ]
    }
  };
}

function serveStatic(reqPath, res) {
  const safePath = reqPath === '/' ? '/index.html' : reqPath;
  const normalized = path.normalize(safePath).replace(/^\.+/, '');
  const filePath = path.join(PUBLIC_DIR, normalized);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden path' });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not Found' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', service: 'ai-document-automation' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/automate') {
    try {
      const body = await parseJsonBody(req);
      const result = runMockAutomation(body.documentText);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, { error: err.message || 'Bad Request' });
    }
    return;
  }

  if (req.method === 'GET') {
    serveStatic(url.pathname, res);
    return;
  }

  sendJson(res, 405, { error: 'Method Not Allowed' });
});

server.listen(PORT, HOST, () => {
  console.log(`AI Document Automation MVP running at http://${HOST}:${PORT}`);
});
