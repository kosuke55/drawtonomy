import { useState, useEffect, useRef } from 'react'
import { ExtensionClient } from './ExtensionClient'
import { generateScene, ANTHROPIC_MODELS, OPENAI_MODELS } from './sceneGenerator'
import type { InitPayload } from './types'

// drawtonomy design tokens (matches PANEL_COLORS / PANEL_TYPOGRAPHY / PANEL_SPACING)
const COLORS = {
  bgDefault: '#f4f4f5',
  bgActive: '#e0e7ff',
  bgValue: '#f9fafb',
  textActive: '#4f46e5',
  textSecondary: '#6b7280',
  textLabel: '#374151',
  textMuted: '#71717a',
  borderDefault: '#e4e4e7',
  danger: '#dc2626',
  separator: '#e4e4e7',
} as const

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.5625rem',
  fontWeight: 600,
  color: COLORS.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.625rem',
  fontWeight: 400,
  color: COLORS.textLabel,
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  border: `1px solid ${COLORS.borderDefault}`,
  borderRadius: 4,
  fontSize: '0.625rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
  backgroundColor: COLORS.bgValue,
  color: COLORS.textLabel,
}

const separatorStyle: React.CSSProperties = {
  height: 1,
  backgroundColor: COLORS.separator,
  margin: '8px 0',
}

export function SceneGeneratorUI() {
  const [client] = useState(() => new ExtensionClient('ai-scene-generator'))
  const [initPayload, setInitPayload] = useState<InitPayload | null>(null)
  const [prompt, setPrompt] = useState('')
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem('ai-scene-gen-api-key') ?? '' } catch { return '' }
  })
  const [apiProvider, setApiProvider] = useState<'anthropic' | 'openai'>(() => {
    try { return (localStorage.getItem('ai-scene-gen-provider') as 'anthropic' | 'openai') ?? 'anthropic' } catch { return 'anthropic' }
  })
  const [model, setModel] = useState(() => {
    try { return localStorage.getItem('ai-scene-gen-model') ?? ANTHROPIC_MODELS[0].id } catch { return ANTHROPIC_MODELS[0].id }
  })
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [logExpanded, setLogExpanded] = useState(false)

  useEffect(() => {
    client.waitForInit().then(payload => {
      setInitPayload(payload)
      addLog('Connected to drawtonomy host')
    })
  }, [client])

  const addLog = (msg: string) => {
    setLog(prev => [...prev.slice(-20), `${new Date().toLocaleTimeString()} ${msg}`])
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    if (!apiKey.trim()) {
      setError('Please enter your API key')
      return
    }

    setGenerating(true)
    setError(null)
    setLogExpanded(true)
    addLog(`Generating scene: "${prompt.slice(0, 50)}..."`)

    try {
      // Save API key (may fail in sandboxed iframe)
      try {
        localStorage.setItem('ai-scene-gen-api-key', apiKey)
        localStorage.setItem('ai-scene-gen-provider', apiProvider)
        localStorage.setItem('ai-scene-gen-model', model)
      } catch { /* sandboxed iframe */ }

      // Get existing shapes for context
      let existingShapes: unknown[] = []
      try {
        existingShapes = await client.requestShapes({ types: ['lane', 'vehicle', 'pedestrian'] })
        addLog(`Read ${existingShapes.length} existing shapes for context`)
      } catch {
        addLog('Could not read existing shapes (continuing without context)')
      }

      // Get viewport
      let viewport = { x: 0, y: 0, zoom: 1, width: 1200, height: 800 }
      try {
        viewport = await client.requestViewport()
        addLog(`Viewport: ${viewport.width}x${viewport.height} at zoom ${viewport.zoom.toFixed(2)}`)
      } catch {
        addLog('Could not read viewport (using defaults)')
      }

      // Generate scene
      const shapes = await generateScene({
        prompt,
        apiKey,
        apiProvider,
        model,
        existingShapes,
        viewport,
      })

      addLog(`Generated ${shapes.length} shapes`)

      // Send shapes to host
      client.addShapes(shapes)
      client.notify(`Generated ${shapes.length} shapes`, 'success')
      addLog('Shapes sent to canvas')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      addLog(`Error: ${msg}`)
      client.notify(`Generation failed: ${msg}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ padding: 8, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Status */}
      {!initPayload && (
        <div style={{
          fontSize: '0.5625rem',
          color: '#f59e0b',
          backgroundColor: '#fffbeb',
          padding: '4px 6px',
          borderRadius: 4,
          marginBottom: 8,
        }}>
          Connecting to host...
        </div>
      )}

      {/* Provider */}
      <div style={{ marginBottom: 8 }}>
        <div style={sectionTitleStyle}>PROVIDER</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['anthropic', 'openai'] as const).map(p => (
            <button
              key={p}
              onClick={() => {
                setApiProvider(p)
                setModel(p === 'anthropic' ? ANTHROPIC_MODELS[0].id : OPENAI_MODELS[0].id)
              }}
              style={{
                flex: 1,
                padding: 4,
                fontSize: '0.5625rem',
                fontWeight: 500,
                backgroundColor: apiProvider === p ? COLORS.bgActive : COLORS.bgDefault,
                color: apiProvider === p ? COLORS.textActive : COLORS.textMuted,
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.15s',
                outline: 'none',
              }}
            >
              {p === 'anthropic' ? 'Claude' : 'GPT'}
            </button>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={apiProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
          style={inputStyle}
        />
      </div>

      {/* Model */}
      <div style={{ marginBottom: 8 }}>
        <div style={sectionTitleStyle}>MODEL</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(apiProvider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS).map(m => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              style={{
                padding: '3px 6px',
                fontSize: '0.5625rem',
                fontWeight: 500,
                backgroundColor: model === m.id ? COLORS.bgActive : COLORS.bgDefault,
                color: model === m.id ? COLORS.textActive : COLORS.textMuted,
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.15s',
                outline: 'none',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div style={separatorStyle} />

      {/* Prompt */}
      <div style={{ marginBottom: 8 }}>
        <div style={sectionTitleStyle}>SCENE DESCRIPTION</div>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={"Describe the traffic scene...\n\nExample: A two-lane road with two cars and a pedestrian"}
          rows={4}
          style={{
            ...inputStyle,
            resize: 'vertical',
            lineHeight: 1.4,
          }}
        />
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating || !prompt.trim() || !apiKey.trim()}
        style={{
          width: '100%',
          padding: '5px 8px',
          fontSize: '0.5625rem',
          fontWeight: 500,
          backgroundColor: generating
            ? COLORS.bgDefault
            : (!prompt.trim() || !apiKey.trim())
              ? COLORS.bgDefault
              : COLORS.bgActive,
          color: generating
            ? COLORS.textMuted
            : (!prompt.trim() || !apiKey.trim())
              ? COLORS.textMuted
              : COLORS.textActive,
          border: 'none',
          borderRadius: 4,
          cursor: generating ? 'not-allowed' : (!prompt.trim() || !apiKey.trim()) ? 'default' : 'pointer',
          transition: 'all 0.15s',
          outline: 'none',
        }}
      >
        {generating ? 'Generating...' : 'Generate Scene'}
      </button>

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 8,
          padding: '4px 6px',
          backgroundColor: '#fef2f2',
          color: COLORS.danger,
          borderRadius: 4,
          fontSize: '0.5625rem',
          lineHeight: 1.4,
        }}>
          {error}
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              ...sectionTitleStyle,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              userSelect: 'none',
            }}
            onClick={() => setLogExpanded(!logExpanded)}
          >
            <span style={{
              display: 'inline-block',
              fontSize: '0.5rem',
              transition: 'transform 0.15s',
              transform: logExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}>
              ▶
            </span>
            LOG ({log.length})
          </div>
          {logExpanded && (
            <div style={{
              fontSize: '0.5625rem',
              color: COLORS.textMuted,
              maxHeight: 100,
              overflow: 'auto',
              backgroundColor: COLORS.bgValue,
              padding: '4px 6px',
              borderRadius: 4,
              lineHeight: 1.5,
            }}>
              {log.map((entry, i) => (
                <div key={i}>{entry}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
