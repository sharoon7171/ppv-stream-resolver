import { Impit } from 'impit'
import { EMBED_ORIGIN, USER_AGENT } from '../constants.js'
import {
  isM3u8Resource,
  isPlayablePlaylist,
  isPoisonPlaylist,
  isSegmentBody,
  sniffMedia,
} from './media.js'

let impit = null

function client() {
  if (!impit) impit = new Impit({ browser: 'chrome' })
  return impit
}

function upstreamHeaders() {
  return {
    Referer: `${EMBED_ORIGIN}/`,
    Origin: EMBED_ORIGIN,
    'User-Agent': USER_AGENT,
    Accept: '*/*',
  }
}

function isHtmlBody(body) {
  const head = body.toString('utf8', 0, 200).toLowerCase()
  return head.includes('<html') || head.includes('403 forbidden')
}

function okBody(body, url) {
  if (!body?.length || isHtmlBody(body)) return false
  if (isM3u8Resource(url) || sniffMedia(body).kind === 'playlist') {
    return isPlayablePlaylist(body) && !isPoisonPlaylist(body)
  }
  return isSegmentBody(body) || sniffMedia(body).kind === 'binary'
}

export async function upstreamFetch(url) {
  const res = await client().fetch(url, { headers: upstreamHeaders(), redirect: 'follow' })
  const result = {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: Buffer.from(await res.arrayBuffer()),
  }
  if (result.status >= 200 && result.status < 300 && okBody(result.body, url)) return result
  if (isPoisonPlaylist(result.body)) throw new Error('upstream playlist blocked')
  throw new Error(`upstream ${result.status}`)
}
