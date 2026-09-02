#!/usr/bin/env node
// Minimal web chat front-end for the `claude` CLI.
// Uses your existing Claude subscription login — no API key involved.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 5173);
const HOST = '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

const SYSTEM_PROMPT =
  'You are Claude, a helpful, knowledgeable and honest assistant made by Anthropic. ' +
  'You are answering questions in a simple chat window. Reply conversationally in ' +
  'markdown. Be clear and direct, and say when you are unsure.';

const MODELS = new Set(['opus', 'sonnet', 'haiku']);
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Claude's per-image limit
const MAX_BODY_BYTES = 48 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res) {
  const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > MAX_BODY_BYTES) reject(new Error('Message too large'));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function handleChat(req, res) {
  readBody(req).then((body) => {
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
    const model = MODELS.has(body.model) ? body.model : 'sonnet';

    const fail = (msg) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    };

    // Attached images arrive as base64, already downscaled by the browser.
    const images = [];
    for (const img of Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : []) {
      if (!img || !IMAGE_TYPES.has(img.mediaType) || typeof img.data !== 'string') {
        return fail('Unsupported image. Use PNG, JPEG, GIF or WebP.');
      }
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(img.data)) return fail('Malformed image data.');
      if (Buffer.byteLength(img.data, 'base64') > MAX_IMAGE_BYTES) {
        return fail('An image is larger than the 5 MB limit.');
      }
      images.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
    }

    if (!message && !images.length) return fail('Empty message');

    // Images first, then the question — Claude reads this order best.
    const content = [...images, { type: 'text', text: message || 'What is in this image?' }];

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event, data) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const args = [
      '--print',
      '--safe-mode',
      '--tools', '',
      '--model', model,
      '--system-prompt', SYSTEM_PROMPT,
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
    ];
    // Reuse the CLI session so the conversation keeps its history.
    if (/^[0-9a-f-]{36}$/i.test(sessionId || '')) args.push('--resume', sessionId);

    const child = spawn('claude', args, {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'ask-claude-web' },
    });

    let streamedAny = false;
    let stderr = '';
    let buffer = '';
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (!child.killed) child.kill('SIGTERM');
    };
    req.on('close', cleanup);

    child.on('error', (err) => {
      const hint =
        err.code === 'ENOENT'
          ? 'The `claude` command was not found. Install Claude Code and make sure it is on your PATH.'
          : err.message;
      send('error', { message: hint });
      if (!res.writableEnded) res.end();
    });

    child.stderr.on('data', (c) => {
      stderr += c.toString();
    });

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }

        if (msg.session_id) send('session', { sessionId: msg.session_id });

        // Token-by-token text as it is generated.
        if (msg.type === 'stream_event' && msg.event) {
          const ev = msg.event;
          if (ev.type === 'content_block_delta' && ev.delta && typeof ev.delta.text === 'string') {
            streamedAny = true;
            send('delta', { text: ev.delta.text });
          }
          continue;
        }

        // Fallback for builds that do not emit partial chunks.
        if (msg.type === 'assistant' && msg.message && Array.isArray(msg.message.content)) {
          if (streamedAny) continue;
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              streamedAny = true;
              send('delta', { text: block.text });
            }
          }
          continue;
        }

        if (msg.type === 'result') {
          if (msg.is_error || msg.subtype === 'error_during_execution') {
            send('error', { message: msg.result || 'Claude returned an error.' });
          } else if (!streamedAny && typeof msg.result === 'string' && msg.result) {
            send('delta', { text: msg.result });
          }
          send('done', {
            sessionId: msg.session_id || sessionId,
            costUsd: msg.total_cost_usd || 0,
            durationMs: msg.duration_ms || 0,
          });
        }
      }
    });

    child.on('close', (code) => {
      if (code !== 0 && !streamedAny) {
        send('error', { message: stderr.trim() || `claude exited with code ${code}` });
      }
      if (!res.writableEnded) {
        send('done', { sessionId });
        res.end();
      }
    });

    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n');
  }).catch((err) => {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405).end('Method not allowed');
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Ask Claude is running at  http://${HOST}:${PORT}\n`);
  console.log('  Powered by your Claude Code login (no API key needed).');
  console.log('  Press Ctrl+C to stop.\n');
});
