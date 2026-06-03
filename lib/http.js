import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeProxyHlsResponse } from './hls.js'
import { resolveStream } from './resolve.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const indexPath = path.join(root, 'public/index.html')

function requestOrigin(req) {
  const host = req.headers.host || '127.0.0.1:8788'
  return `http://${host}`
}

function json(res, status, body) {
  if (res.headersSent) return
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(body))
}

function text(res, status, message) {
  if (res.headersSent) return
  res.writeHead(status, { 'Content-Type': 'text/plain' })
  res.end(message)
}

async function readJson(req) {
  let body = ''
  for await (const chunk of req) body += chunk
  return JSON.parse(body)
}

function serveIndex(res) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  fs.createReadStream(indexPath).pipe(res)
}

export async function handleRequest(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1:8788'}`)
  const origin = requestOrigin(req)

  try {
    if (url.pathname === '/api/hls') {
      const target = url.searchParams.get('url')
      if (!target) return json(res, 400, { error: 'url required' })
      try {
        await writeProxyHlsResponse(res, target, url.searchParams.get('embed') || undefined)
      } catch (err) {
        text(res, 502, String(err.message || 'upstream error'))
      }
      return
    }

    if (url.pathname === '/api/stream') {
      if (req.method !== 'POST') return json(res, 405, { error: 'POST required' })
      const payload = await readJson(req).catch(() => null)
      const started = Date.now()
      const result = await resolveStream(payload, origin)
      console.log(`[api/stream] ${result.ok ? 'ok' : result.stage} ${Date.now() - started}ms`)
      return json(res, 200, result)
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      serveIndex(res)
      return
    }

    text(res, 404, 'not found')
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) })
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  const port = Number(process.env.PORT || 8788)
  const host = process.env.HOST || '127.0.0.1'
  http.createServer(handleRequest).listen(port, host, () => {
    console.log(`ppv-stream-resolver http://${host}:${port}`)
  })
}
