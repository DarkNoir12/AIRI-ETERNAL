export interface LlmJsonInterceptorOptions {
  onText: (text: string) => void | Promise<void>
  onJson: (json: any, raw: string) => void | Promise<void>
}

/**
 * Intercepts fenced JSON-like blocks from streamed LLM output while passing
 * normal text through immediately.
 * Also detects bare JSON array tool calls like [{"name":"...","arguments":{...}}]
 * that the LLM may output without markdown code fences.
 */
export function createLlmJsonInterceptor(options: LlmJsonInterceptorOptions) {
  let buffer = ''
  let inBlock = false
  let currentBlockType: 'json' | 'generic' | null = null

  const JSON_BLOCK_START = '```json'
  const GENERIC_BLOCK_START = '```'
  const BLOCK_END = '```'

  // Try to extract a complete bare JSON tool call from the start of text
  // Returns the raw JSON string if found, null otherwise
  function tryExtractBareJsonToolCall(text: string): string | null {
    // Quick check: does it start with a JSON tool call pattern?
    if (!/^\s*\[\s*\{/.test(text))
      return null

    // Try to find the matching closing bracket
    let depth = 0
    let inString = false
    let escapeNext = false
    let endIdx = -1

    for (let i = 0; i < text.length; i++) {
      const char = text[i]

      if (escapeNext) {
        escapeNext = false
        continue
      }

      if (char === '\\' && inString) {
        escapeNext = true
        continue
      }

      if (char === '"' && !escapeNext) {
        inString = !inString
        continue
      }

      if (inString)
        continue

      if (char === '[' || char === '{')
        depth++
      if (char === ']' || char === '}')
        depth--

      if (depth === 0 && char === ']') {
        endIdx = i
        break
      }
    }

    if (endIdx === -1)
      return null

    const candidate = text.slice(0, endIdx + 1).trim()

    // Validate it's actually valid JSON
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed) && parsed.length > 0
        && typeof parsed[0] === 'object'
        && 'name' in parsed[0]
        && 'arguments' in parsed[0]) {
        return candidate
      }
    }
    catch {
      return null
    }

    return null
  }

  // Try to extract a complete [ACT:{...}] action marker from the start of text
  // Returns the raw string if found, null otherwise
  function tryExtractActMarker(text: string): string | null {
    if (!text.startsWith('[ACT:'))
      return null

    // Find the matching closing bracket
    let depth = 0
    let inString = false
    let escapeNext = false
    let endIdx = -1

    for (let i = 0; i < text.length; i++) {
      const char = text[i]

      if (escapeNext) {
        escapeNext = false
        continue
      }

      if (char === '\\' && inString) {
        escapeNext = true
        continue
      }

      if (char === '"' && !escapeNext) {
        inString = !inString
        continue
      }

      if (inString)
        continue

      if (char === '{')
        depth++
      if (char === '}')
        depth--

      if (char === ']' && depth === 0) {
        endIdx = i
        break
      }
    }

    if (endIdx === -1)
      return null

    return text.slice(0, endIdx + 1).trim()
  }

  return {
    async consume(chunk: string) {
      buffer += chunk

      while (buffer.length > 0) {
        if (!inBlock) {
          // First, check for bare JSON array tool calls
          const bareJson = tryExtractBareJsonToolCall(buffer)
          if (bareJson) {
            try {
              const parsed = JSON.parse(bareJson)
              await options.onJson(parsed, bareJson)
            }
            catch {
              // If parsing fails, pass through as text
              await options.onText(bareJson)
            }
            buffer = buffer.slice(bareJson.length)
            continue
          }

          // Check for [ACT:{...}] action markers
          const actMarker = tryExtractActMarker(buffer)
          if (actMarker) {
            try {
              // Extract the JSON inside [ACT:...]
              const jsonContent = actMarker.slice(5, -1) // Remove "[ACT:" and "]"
              const parsed = JSON.parse(jsonContent)
              await options.onJson(parsed, actMarker)
            }
            catch {
              // If parsing fails, just skip the marker entirely (don't send to TTS)
              // Don't call onText for action markers
            }
            buffer = buffer.slice(actMarker.length)
            continue
          }

          const jsonIdx = buffer.indexOf(JSON_BLOCK_START)
          const genericIdx = buffer.indexOf(GENERIC_BLOCK_START)

          const lastBacktickIdx = buffer.lastIndexOf('`')
          if (lastBacktickIdx !== -1 && lastBacktickIdx > buffer.length - 8) {
            const tail = buffer.slice(lastBacktickIdx)
            if (JSON_BLOCK_START.startsWith(tail) || GENERIC_BLOCK_START.startsWith(tail)) {
              const emitText = buffer.slice(0, lastBacktickIdx)
              if (emitText)
                await options.onText(emitText)
              buffer = tail
              break
            }
          }

          if (jsonIdx === -1 && genericIdx === -1) {
            await options.onText(buffer)
            buffer = ''
            break
          }

          let startIdx = -1
          let type: 'json' | 'generic' = 'generic'

          if (jsonIdx !== -1 && (genericIdx === -1 || jsonIdx <= genericIdx)) {
            startIdx = jsonIdx
            type = 'json'
          }
          else {
            startIdx = genericIdx
            type = 'generic'
          }

          if (startIdx > 0) {
            await options.onText(buffer.slice(0, startIdx))
            buffer = buffer.slice(startIdx)
          }

          inBlock = true
          currentBlockType = type
        }
        else {
          const startMarker = currentBlockType === 'json' ? JSON_BLOCK_START : GENERIC_BLOCK_START
          const endIdx = buffer.indexOf(BLOCK_END, startMarker.length)

          if (endIdx === -1)
            break

          const fullBlock = buffer.slice(0, endIdx + BLOCK_END.length)
          const content = buffer.slice(startMarker.length, endIdx).trim()

          let handled = false
          if (currentBlockType === 'json' || (content.startsWith('{') && content.endsWith('}'))) {
            try {
              const parsed = JSON.parse(content)
              if (parsed && typeof parsed === 'object' && ('component' in parsed || 'componentName' in parsed || ('action' in parsed && 'id' in parsed))) {
                await options.onJson(parsed, fullBlock)
                handled = true
              }
            }
            catch {
              // Not valid JSON, fall through to text emission.
            }
          }

          if (!handled)
            await options.onText(fullBlock)

          buffer = buffer.slice(endIdx + BLOCK_END.length)
          inBlock = false
          currentBlockType = null
        }
      }
    },

    async end() {
      if (buffer) {
        // Check for incomplete bare JSON tool calls at end
        const bareJson = tryExtractBareJsonToolCall(buffer)
        if (bareJson) {
          try {
            const parsed = JSON.parse(bareJson)
            await options.onJson(parsed, bareJson)
          }
          catch {
            await options.onText(bareJson)
          }
          buffer = buffer.slice(bareJson.length)
        }
        // Check for ACT markers at end
        const actMarker = tryExtractActMarker(buffer)
        if (actMarker) {
          try {
            const jsonContent = actMarker.slice(5, -1)
            const parsed = JSON.parse(jsonContent)
            await options.onJson(parsed, actMarker)
          }
          catch {
            // Skip ACT markers that can't be parsed
          }
          buffer = buffer.slice(actMarker.length)
        }
        if (buffer) {
          await options.onText(buffer)
        }
        buffer = ''
      }
      inBlock = false
      currentBlockType = null
    },
  }
}
