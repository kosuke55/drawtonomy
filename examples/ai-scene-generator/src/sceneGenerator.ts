// Scene Generator - AI API integration for generating traffic scenes
import type { BaseShape } from './types'

export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { id: 'claude-haiku-4-20250506', label: 'Claude Haiku 4' },
] as const

export const OPENAI_MODELS = [
  { id: 'o3-mini', label: 'o3-mini' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
] as const

export type AnthropicModelId = typeof ANTHROPIC_MODELS[number]['id']
export type OpenAIModelId = typeof OPENAI_MODELS[number]['id']

interface GenerateOptions {
  prompt: string
  apiKey: string
  apiProvider: 'anthropic' | 'openai'
  model: string
  existingShapes: unknown[]
  viewport: { x: number; y: number; zoom: number; width: number; height: number }
}

const SYSTEM_PROMPT = `You are a traffic scene generator for drawtonomy, a drawing editor for road/traffic scenarios.

Generate shapes as JSON based on the user's description. Available shape types:

1. **point** - A coordinate point (used as vertices for linestrings)
   Props: { color: string, visible: boolean, osmId: string }

2. **linestring** - A line connecting points (used as lane boundaries)
   Props: { pointIds: string[], color: string, strokeWidth: number, attributes: { type: "linestring", subtype: "solid"|"dashed" } }

3. **lane** - A road lane defined by two boundary linestrings
   Props: { leftBoundaryId: string, rightBoundaryId: string, invertLeft: boolean, invertRight: boolean, color: "default"|"grey-300"|..., size: "m", attributes: { type: "lanelet", subtype: "road"|"sidewalk"|"crosswalk", speed_limit: "30" }, next: string[], prev: string[] }

4. **vehicle** - A vehicle shape
   Props: { w: number, h: number, color: string, size: "s"|"m"|"l", attributes: { type: "vehicle", subtype: "car"|"bus"|"truck"|"motorcycle"|"bicycle" }, templateId: "default"|"sedan"|"bus"|"truck"|"motorcycle"|"bicycle" }

5. **pedestrian** - A pedestrian shape
   Props: { w: number, h: number, color: string, size: "s"|"m"|"l", attributes: { type: "pedestrian", subtype: "person" }, templateId: "filled"|"walking"|"simple" }

6. **crosswalk** - A crosswalk (requires point references)
   Props: { pointIds: string[], color: "white", attributes: { type: "crosswalk" } }

Rules:
- IDs must be unique strings (use descriptive names like "pt-left-1", "ls-left", "lane-1")
- Lanes need: points → linestrings → lane (in dependency order)
- A typical lane width is ~70-100 units
- Place shapes relative to center (0, 0)
- All shapes need: id, type, x, y, rotation (usually 0), zIndex (0), props
- Rotation is in radians
- For vehicles: default size is w:90, h:45. Place them ON lanes.

Respond with ONLY a JSON array of shapes. No explanation or markdown.`

export async function generateScene(options: GenerateOptions): Promise<BaseShape[]> {
  const { prompt, apiKey, apiProvider, existingShapes, viewport } = options

  const contextInfo = existingShapes.length > 0
    ? `\n\nExisting shapes on canvas (${existingShapes.length} total) for reference - place new shapes relative to these.`
    : ''

  const userMessage = `${prompt}${contextInfo}\n\nViewport: ${viewport.width}x${viewport.height}, zoom: ${viewport.zoom.toFixed(2)}`

  let responseText: string

  if (apiProvider === 'anthropic') {
    responseText = await callAnthropic(apiKey, userMessage, options.model)
  } else {
    responseText = await callOpenAI(apiKey, userMessage, options.model)
  }

  // Parse response
  const shapes = parseShapesResponse(responseText)
  return shapes
}

async function callAnthropic(apiKey: string, userMessage: string, model: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Anthropic API error: ${response.status} ${err}`)
  }

  const data = await response.json()
  return data.content[0].text
}

async function callOpenAI(apiKey: string, userMessage: string, model: string): Promise<string> {
  // o3系モデルはmax_tokensではなくmax_completion_tokensを使う
  const isO3 = model.startsWith('o3')
  const tokenParam = isO3
    ? { max_completion_tokens: 4096 }
    : { max_tokens: 4096 }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      ...tokenParam,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${err}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

function parseShapesResponse(text: string): BaseShape[] {
  // Try to extract JSON array from response
  let jsonStr = text.trim()

  // Remove markdown code blocks if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  // Find JSON array
  const arrayStart = jsonStr.indexOf('[')
  const arrayEnd = jsonStr.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1)
  }

  const parsed = JSON.parse(jsonStr)
  if (!Array.isArray(parsed)) {
    throw new Error('AI response is not an array of shapes')
  }

  // Basic validation
  return parsed.map((shape: any) => ({
    id: String(shape.id ?? `gen_${Math.random().toString(36).slice(2, 8)}`),
    type: String(shape.type),
    x: Number(shape.x) || 0,
    y: Number(shape.y) || 0,
    rotation: Number(shape.rotation) || 0,
    zIndex: Number(shape.zIndex) || 0,
    props: shape.props ?? {},
  }))
}
