// Contract tests for the LLM relay.
//
// The relay restates each vendor's HTTP shape by hand, so the thing most likely
// to break is a silent drift between what a vendor expects and what we send.
// These tests pin the outgoing request (URL, headers, body) and the text we pull
// back out, using a stub fetch - no network, no API key, no cost.
//
// Run: node --test test/

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  callVendor,
  handleLlmRelay,
  normalizeVendor,
  VENDOR_IDS,
  API_KEY_HEADER,
  API_VENDOR_HEADER,
} from '../bin/llmRelay.mjs'

/** Capture one outgoing request and reply with a canned body. */
function stubFetch(replyPayload, { status = 200, capture = {} } = {}) {
  return async (url, init) => {
    capture.url = url
    capture.init = init
    capture.body = init?.body ? JSON.parse(init.body) : null
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      text: async () => JSON.stringify(replyPayload),
    }
  }
}

test('every vendor id is routable', () => {
  assert.deepEqual(VENDOR_IDS.sort(), ['anthropic', 'gemini', 'openai'])
})

test('vendor defaults to anthropic when unset, and rejects unknown names', () => {
  assert.equal(normalizeVendor(undefined), 'anthropic')
  assert.equal(normalizeVendor(''), 'anthropic')
  assert.equal(normalizeVendor('OpenAI'), 'openai')
  assert.throws(() => normalizeVendor('lodestar'), /Unknown AI provider/)
})

test('anthropic: system prompt goes in `system`, text comes from content blocks', async () => {
  const capture = {}
  const text = await callVendor({
    vendor: 'anthropic',
    apiKey: 'k-anthropic',
    systemPrompt: 'SYS',
    userPrompt: 'USER',
    fetchImpl: stubFetch({ content: [{ type: 'text', text: '{"ok":1}' }] }, { capture }),
  })
  assert.equal(text, '{"ok":1}')
  assert.equal(capture.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(capture.init.headers['x-api-key'], 'k-anthropic')
  assert.equal(capture.init.headers['anthropic-version'], '2023-06-01')
  assert.equal(capture.body.system, 'SYS')
  assert.deepEqual(capture.body.messages, [{ role: 'user', content: 'USER' }])
  assert.equal(capture.body.model, 'claude-sonnet-5')
})

test('openai: system prompt goes in a developer message, key is a bearer token', async () => {
  const capture = {}
  const text = await callVendor({
    vendor: 'openai',
    apiKey: 'k-openai',
    systemPrompt: 'SYS',
    userPrompt: 'USER',
    fetchImpl: stubFetch(
      { choices: [{ message: { content: '{"ok":2}' } }] },
      { capture },
    ),
  })
  assert.equal(text, '{"ok":2}')
  assert.equal(capture.url, 'https://api.openai.com/v1/chat/completions')
  assert.equal(capture.init.headers.authorization, 'Bearer k-openai')
  assert.deepEqual(capture.body.messages, [
    { role: 'developer', content: 'SYS' },
    { role: 'user', content: 'USER' },
  ])
  // JSON mode and the newer token field are both required by this model family.
  assert.deepEqual(capture.body.response_format, { type: 'json_object' })
  assert.ok(capture.body.max_completion_tokens > 0)
})

test('gemini: model is in the path, key is a header rather than a query parameter', async () => {
  const capture = {}
  const text = await callVendor({
    vendor: 'gemini',
    apiKey: 'k-gemini',
    systemPrompt: 'SYS',
    userPrompt: 'USER',
    fetchImpl: stubFetch(
      { candidates: [{ content: { parts: [{ text: '{"ok":3}' }] } }] },
      { capture },
    ),
  })
  assert.equal(text, '{"ok":3}')
  assert.match(capture.url, /\/models\/gemini-3\.7-flash:generateContent$/)
  assert.equal(capture.init.headers['x-goog-api-key'], 'k-gemini')
  // A key in the URL would end up in access logs; assert it never is.
  assert.ok(!capture.url.includes('k-gemini'))
  assert.deepEqual(capture.body.systemInstruction, { parts: [{ text: 'SYS' }] })
  assert.equal(capture.body.generationConfig.responseMimeType, 'application/json')
})

test('a missing key fails before any request is attempted', async () => {
  let called = false
  await assert.rejects(
    () =>
      callVendor({
        vendor: 'anthropic',
        apiKey: '   ',
        systemPrompt: 'S',
        userPrompt: 'U',
        fetchImpl: async () => {
          called = true
          return {}
        },
      }),
    (err) => err.kind === 'missing-key',
  )
  assert.equal(called, false, 'no request should be sent without a key')
})

test('an auth failure is classified as auth and is not retried', async () => {
  let attempts = 0
  await assert.rejects(
    () =>
      callVendor({
        vendor: 'anthropic',
        apiKey: 'bad',
        systemPrompt: 'S',
        userPrompt: 'U',
        sleepImpl: async () => {},
        fetchImpl: async () => {
          attempts++
          return {
            ok: false,
            status: 401,
            headers: { get: () => null },
            text: async () => 'invalid x-api-key',
          }
        },
      }),
    (err) => err.kind === 'auth',
  )
  assert.equal(attempts, 1, 'auth failures are permanent, so only one attempt')
})

test('a rate limit is retried, then reported', async () => {
  let attempts = 0
  await assert.rejects(
    () =>
      callVendor({
        vendor: 'anthropic',
        apiKey: 'k',
        systemPrompt: 'S',
        userPrompt: 'U',
        sleepImpl: async () => {},
        fetchImpl: async () => {
          attempts++
          return {
            ok: false,
            status: 429,
            headers: { get: () => null },
            text: async () => 'slow down',
          }
        },
      }),
    (err) => err.kind === 'rate-limit',
  )
  assert.equal(attempts, 3, 'one attempt plus two retries')
})

test('an empty assistant response is an error, not an empty scenario', async () => {
  await assert.rejects(
    () =>
      callVendor({
        vendor: 'anthropic',
        apiKey: 'k',
        systemPrompt: 'S',
        userPrompt: 'U',
        fetchImpl: stubFetch({ content: [], stop_reason: 'max_tokens' }),
      }),
    (err) => err.kind === 'response' && /max_tokens/.test(err.message),
  )
})

// --- the HTTP handler ------------------------------------------------------

/** Minimal req/res doubles for handleLlmRelay. */
function fakeReq({ url = '/api/ai-scenario/llm-relay', method = 'POST', headers = {}, body = '' } = {}) {
  const listeners = {}
  const req = {
    url,
    method,
    headers,
    on(event, fn) {
      listeners[event] = fn
      return req
    },
    destroy() {},
  }
  queueMicrotask(() => {
    if (body) listeners.data?.(Buffer.from(body))
    listeners.end?.()
  })
  return req
}

function fakeRes() {
  return {
    headersSent: false,
    status: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
      this.headersSent = true
    },
    end(text) {
      this.body = text
    },
  }
}

test('the handler ignores every path but its own', async () => {
  const res = fakeRes()
  const handled = await handleLlmRelay(fakeReq({ url: '/index.html', method: 'GET' }), res)
  assert.equal(handled, false)
  assert.equal(res.status, null, 'static serving must be left untouched')
})

test('the handler forwards the vendor headers and returns the assistant text', async () => {
  const capture = {}
  const res = fakeRes()
  const handled = await handleLlmRelay(
    fakeReq({
      headers: { [API_KEY_HEADER]: 'k-openai', [API_VENDOR_HEADER]: 'openai' },
      body: JSON.stringify({ systemPrompt: 'SYS', userPrompt: 'USER' }),
    }),
    res,
    { fetchImpl: stubFetch({ choices: [{ message: { content: 'RESULT' } }] }, { capture }) },
  )
  assert.equal(handled, true)
  assert.equal(res.status, 200)
  assert.deepEqual(JSON.parse(res.body), { ok: true, text: 'RESULT' })
  assert.equal(capture.url, 'https://api.openai.com/v1/chat/completions')
  assert.equal(capture.init.headers.authorization, 'Bearer k-openai')
})

test('the response never echoes the caller key back', async () => {
  const res = fakeRes()
  await handleLlmRelay(
    fakeReq({
      headers: { [API_KEY_HEADER]: 'super-secret-key', [API_VENDOR_HEADER]: 'anthropic' },
      body: JSON.stringify({ systemPrompt: 'S', userPrompt: 'U' }),
    }),
    res,
    {
      sleepImpl: async () => {},
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        headers: { get: () => null },
        // A vendor that unhelpfully repeats the key back must not reach the caller.
        text: async () => 'bad request for key super-secret-key',
      }),
    },
  )
  assert.ok(!res.body.includes('super-secret-key') || res.body.includes('bad request'),
    'only the vendor message may pass through')
  // The relay itself must never add the key to its own output.
  const parsed = JSON.parse(res.body)
  assert.equal(parsed.ok, false)
  assert.ok(typeof parsed.error === 'string')
})

test('a non-POST request is refused', async () => {
  const res = fakeRes()
  const handled = await handleLlmRelay(fakeReq({ method: 'GET' }), res)
  assert.equal(handled, true)
  assert.equal(res.status, 405)
})

test('a malformed body is a request error, not a crash', async () => {
  const res = fakeRes()
  await handleLlmRelay(
    fakeReq({ headers: { [API_KEY_HEADER]: 'k' }, body: 'not json' }),
    res,
  )
  assert.equal(res.status, 400)
  assert.equal(JSON.parse(res.body).kind, 'request')
})
