// LLM relay: forwards one prompt to the AI provider the caller selected.
//
// Why a relay exists at all
// -------------------------------------------------------------------------
// drawtonomy can generate a driving scenario from a plain-text description.
// The generation loop runs in the browser, but the browser cannot call the
// AI vendors directly: each vendor has its own CORS policy, and some do not
// allow browser-origin requests at all. So the page posts to this one
// same-origin endpoint instead, and the dev server forwards the request.
//
// Bring your own key
// -------------------------------------------------------------------------
// The API key travels per request, in a header, and is used only to build the
// outgoing request. It is never written to disk, never placed in the process
// environment, and never logged - not even truncated. Only its presence and
// length are observable, and only through the caller's own error messages.
// The key is a header rather than part of the JSON body because bodies are the
// part most likely to end up in a proxy or trace log verbatim.
//
// The relay is bound to the same localhost-only surface as the file serving in
// serve.mjs: it is a development convenience, not a public proxy.
//
// Keeping vendor support honest
// -------------------------------------------------------------------------
// The request/response shapes below are written against each vendor's public
// HTTP API. They are maintained here on their own - this package does not, and
// cannot, import them from anywhere else. When a vendor changes its API, this
// file is the only place in this package that has to change, and the contract
// test in test/llmRelay.test.mjs is what catches the drift.

/** Header carrying the caller's API key (request scope only, never stored). */
export const API_KEY_HEADER = 'x-ai-gen-api-key'
/** Header selecting which vendor the key belongs to. */
export const API_VENDOR_HEADER = 'x-ai-gen-api-provider'

export const DEFAULT_VENDOR = 'anthropic'
export const DEFAULT_MAX_TOKENS = 16000
export const DEFAULT_TIMEOUT_MS = 180000

/** Statuses worth a retry: rate limiting and transient server faults. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529])
const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 1000
/** Upper bound on an honoured Retry-After, so one bad header cannot hang a request. */
const MAX_RETRY_AFTER_MS = 30000

/**
 * One vendor's HTTP shape: where to send, what headers to set, how to build the
 * body, and how to pull the assistant text back out.
 *
 * The prompts themselves are identical across vendors. Only the envelope
 * differs - notably where the system prompt goes, which each vendor names
 * differently.
 */
const VENDORS = {
  anthropic: {
    label: 'Anthropic',
    defaultModel: 'claude-sonnet-5',
    endpoint: () => 'https://api.anthropic.com/v1/messages',
    headers: (apiKey) => ({
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    }),
    buildBody: ({ systemPrompt, userPrompt, model, maxTokens }) => ({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
    extractText: (payload) => {
      if (!Array.isArray(payload?.content)) {
        throw relayError('response', 'Anthropic API response had no content array.')
      }
      const text = payload.content
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('')
      if (text === '') {
        throw relayError(
          'response',
          `Anthropic API returned no text (stop_reason=${payload?.stop_reason ?? 'unknown'}).`,
        )
      }
      return text
    },
  },

  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-5.6-terra',
    endpoint: () => 'https://api.openai.com/v1/chat/completions',
    headers: (apiKey) => ({
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    }),
    buildBody: ({ systemPrompt, userPrompt, model, maxTokens }) => ({
      model,
      max_completion_tokens: maxTokens,
      response_format: { type: 'json_object' },
      // The system prompt goes in a "developer" message on the newer models.
      messages: [
        { role: 'developer', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    extractText: (payload) => {
      const choice = payload?.choices?.[0]
      const content = choice?.message?.content
      if (typeof content !== 'string' || content === '') {
        throw relayError(
          'response',
          `OpenAI API returned no assistant text (finish_reason=${choice?.finish_reason ?? 'unknown'}).`,
        )
      }
      return content
    },
  },

  gemini: {
    label: 'Gemini',
    defaultModel: 'gemini-3.7-flash',
    endpoint: (model) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    // The key goes in a header, not the ?key= query parameter: URLs are the part
    // most likely to be written to an access log.
    headers: (apiKey) => ({
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
    }),
    buildBody: ({ systemPrompt, userPrompt, maxTokens }) => ({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    }),
    extractText: (payload) => {
      const candidate = payload?.candidates?.[0]
      const parts = candidate?.content?.parts
      const text = Array.isArray(parts)
        ? parts.filter((p) => typeof p?.text === 'string').map((p) => p.text).join('')
        : ''
      if (text === '') {
        const reason =
          candidate?.finishReason ?? payload?.promptFeedback?.blockReason ?? 'unknown'
        throw relayError('response', `Gemini API returned no text parts (finishReason=${reason}).`)
      }
      return text
    },
  },
}

export const VENDOR_IDS = Object.keys(VENDORS)

/** An error with a machine-readable kind, safe to show to the caller. */
export function relayError(kind, message) {
  const err = new Error(message)
  err.name = 'RelayError'
  err.kind = kind
  return err
}

/** Resolve a vendor id, falling back to the default when unset. */
export function normalizeVendor(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_VENDOR
  const id = String(raw).trim().toLowerCase()
  if (!VENDOR_IDS.includes(id)) {
    throw relayError(
      'request',
      `Unknown AI provider '${id}'. Expected one of: ${VENDOR_IDS.join(', ')}.`,
    )
  }
  return id
}

/** Map an HTTP status onto a kind the caller can act on. */
function classifyStatus(status) {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server'
  return 'request'
}

function retryAfterMs(headers) {
  const raw = headers?.get?.('retry-after')
  if (!raw) return null
  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Send one prompt to one vendor and return the assistant text.
 *
 * @param {{ vendor?: string, apiKey: string, systemPrompt: string, userPrompt: string,
 *           model?: string, maxTokens?: number, timeoutMs?: number,
 *           fetchImpl?: typeof fetch, sleepImpl?: (ms: number) => Promise<void> }} args
 * @returns {Promise<string>}
 */
export async function callVendor(args) {
  const vendorId = normalizeVendor(args.vendor)
  const vendor = VENDORS[vendorId]
  const fetchImpl = args.fetchImpl ?? globalThis.fetch
  const wait = args.sleepImpl ?? sleep

  const apiKey = typeof args.apiKey === 'string' ? args.apiKey.trim() : ''
  if (apiKey === '') {
    throw relayError('missing-key', `No ${vendor.label} API key was provided.`)
  }
  if (typeof args.systemPrompt !== 'string' || typeof args.userPrompt !== 'string') {
    throw relayError('request', 'Both systemPrompt and userPrompt must be strings.')
  }

  const model =
    typeof args.model === 'string' && args.model.trim() !== ''
      ? args.model.trim()
      : vendor.defaultModel
  const maxTokens =
    Number.isFinite(args.maxTokens) && args.maxTokens > 0 ? args.maxTokens : DEFAULT_MAX_TOKENS
  const timeoutMs =
    Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : DEFAULT_TIMEOUT_MS

  const body = JSON.stringify(
    vendor.buildBody({ systemPrompt: args.systemPrompt, userPrompt: args.userPrompt, model, maxTokens }),
  )

  let lastError = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response
    try {
      response = await fetchImpl(vendor.endpoint(model), {
        method: 'POST',
        headers: vendor.headers(apiKey),
        body,
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timer)
      const timedOut = err?.name === 'AbortError'
      lastError = relayError(
        timedOut ? 'timeout' : 'network',
        timedOut
          ? `${vendor.label} API did not respond within ${Math.round(timeoutMs / 1000)}s.`
          : `Could not reach the ${vendor.label} API: ${err?.message ?? 'network error'}.`,
      )
      if (attempt < MAX_RETRIES) {
        await wait(RETRY_BASE_DELAY_MS * 2 ** attempt)
        continue
      }
      throw lastError
    }
    clearTimeout(timer)

    if (response.ok) {
      const raw = await response.text()
      let payload
      try {
        payload = JSON.parse(raw)
      } catch {
        throw relayError('response', `${vendor.label} API returned a body that was not JSON.`)
      }
      return vendor.extractText(payload)
    }

    // Read the error body for the message, but never echo a key back: the body
    // is the vendor's, and it is truncated to keep one long page out of the UI.
    const detail = (await response.text().catch(() => '')).slice(0, 400)
    const kind = classifyStatus(response.status)
    lastError = relayError(
      kind,
      `${vendor.label} API returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    )
    if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
      await wait(retryAfterMs(response.headers) ?? RETRY_BASE_DELAY_MS * 2 ** attempt)
      continue
    }
    throw lastError
  }
  throw lastError ?? relayError('server', 'The AI request failed.')
}

/** Read the whole request body, refusing anything implausibly large. */
function readBody(req, limitBytes = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limitBytes) {
        reject(relayError('request', 'Request body was too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

/**
 * Handle POST /api/ai-scenario/llm-relay.
 *
 * Returns true when it took the request, false when the caller should keep
 * looking (so the static file serving stays untouched for every other path).
 */
export async function handleLlmRelay(req, res, options = {}) {
  const urlPath = (req.url ?? '').split('?')[0]
  if (urlPath !== '/api/ai-scenario/llm-relay') return false

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Use POST for the AI relay.', kind: 'request' })
    return true
  }

  try {
    const raw = await readBody(req)
    let parsed
    try {
      parsed = JSON.parse(raw || '{}')
    } catch {
      throw relayError('request', 'Request body was not valid JSON.')
    }

    const text = await callVendor({
      vendor: req.headers[API_VENDOR_HEADER],
      apiKey: req.headers[API_KEY_HEADER] ?? '',
      systemPrompt: parsed.systemPrompt,
      userPrompt: parsed.userPrompt,
      model: parsed.model,
      maxTokens: parsed.maxTokens,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.sleepImpl ? { sleepImpl: options.sleepImpl } : {}),
    })
    sendJson(res, 200, { ok: true, text })
  } catch (err) {
    const kind = err?.kind ?? 'server'
    // Errors are reported with HTTP 200 semantics only when they are the
    // vendor's; transport-level problems keep a real status so a caller that
    // checks status still sees them.
    const status = kind === 'request' || kind === 'missing-key' ? 400 : 502
    sendJson(res, status, {
      ok: false,
      error: err?.message ?? 'The AI request failed.',
      kind,
    })
  }
  return true
}
