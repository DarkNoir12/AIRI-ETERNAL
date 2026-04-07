import type { UseQueueReturn } from '@proj-airi/stream-kit'

import type { Emotion, EmotionPayload } from '../constants/emotions'

import { sleep } from '@moeru/std'
import { createQueue } from '@proj-airi/stream-kit'

import { EMOTION_VALUES } from '../constants/emotions'

function normalizeEmotionName(value: string): Emotion | string {
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()
  if (EMOTION_VALUES.includes(lower as Emotion))
    return lower as Emotion
  return trimmed
}

function normalizeIntensity(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value))
    return 1
  return Math.min(1, Math.max(0, value))
}

function extractEmotionsFromPayload(payload: any): EmotionPayload[] {
  const results: EmotionPayload[] = []

  // 1. Standard format: { emotion: { name, intensity }, motion: "..." }
  if (payload?.emotion && typeof payload.emotion === 'object' && !Array.isArray(payload.emotion)) {
    if (typeof payload.emotion.name === 'string') {
      const normalized = normalizeEmotionName(payload.emotion.name)
      if (normalized) {
        const intensity = normalizeIntensity(payload.emotion.intensity)
        results.push({ name: normalized, intensity })
      }
    }
  }
  else if (typeof payload?.emotion === 'string') {
    const normalized = normalizeEmotionName(payload.emotion)
    if (normalized) {
      results.push({ name: normalized, intensity: 1 })
    }
  }

  // 2. LLM dynamic-key format: { "happy": { name: "happy", intensity: 1 }, motion: "agent007" }
  if (results.length === 0) {
    for (const key of Object.keys(payload)) {
      if (key === 'motion' || key === 'emotion')
        continue
      const val = payload[key]
      if (typeof val === 'object' && val?.name) {
        const normalized = normalizeEmotionName(val.name)
        if (normalized) {
          const intensity = normalizeIntensity(val.intensity)
          results.push({ name: normalized, intensity })
        }
        break
      }
      if (typeof val === 'number') {
        const normalized = normalizeEmotionName(key)
        if (normalized) {
          results.push({ name: normalized, intensity: normalizeIntensity(val) })
        }
        break
      }
    }
  }

  // 3. Motion string (VRMA animation cue)
  if (typeof payload?.motion === 'string') {
    const normalized = normalizeEmotionName(payload.motion)
    if (normalized && !results.some(r => r.name === normalized)) {
      results.push({ name: normalized, intensity: 1 })
    }
  }

  return results
}

/**
 * Parses an ACT token from the LLM and extracts emotion payloads.
 * Handles both standard {"emotion":{...},"motion":"..."} and
 * dynamic-key {"happy":{...},"motion":"..."} formats.
 */
export function parseActEmotion(content: string): { ok: boolean, emotions: EmotionPayload[] } {
  const match = /<\|ACT\s*(?::\s*)?([\s\S]*?)(?:\|>|>)/i.exec(content)
  if (!match)
    return { ok: false, emotions: [] }

  const payloadText = match[1].trim()
  let emotions: EmotionPayload[] = []

  // Attempt 1: Strict JSON parse
  try {
    const payload = JSON.parse(payloadText)
    emotions = extractEmotionsFromPayload(payload)
  }
  catch {
    // Attempt 2: Wrap in braces — handles "happy":{...},"motion":"agent007"
    try {
      const wrapped = JSON.parse(`{${payloadText}}`)
      emotions = extractEmotionsFromPayload(wrapped)
    }
    catch { /* ignore */ }
  }

  return { ok: emotions.length > 0, emotions }
}

export function useSpecialTokenQueue(emotionsQueue: UseQueueReturn<EmotionPayload>) {
  const normalizeEmotionName = (value: string): Emotion | string => {
    const trimmed = value.trim()
    const lower = trimmed.toLowerCase()
    // If it matches a known emotion enum value, return the standard key
    if (EMOTION_VALUES.includes(lower as Emotion))
      return lower as Emotion
    // Otherwise return the original casing (needed for VRMA filenames)
    return trimmed
  }

  const normalizeIntensity = (value: unknown): number => {
    if (typeof value !== 'number' || Number.isNaN(value))
      return 1
    return Math.min(1, Math.max(0, value))
  }

  function extractEmotions(payload: any): EmotionPayload[] {
    const results: EmotionPayload[] = []

    // 1. Standard format: { emotion: { name, intensity }, motion: "..." }
    if (payload?.emotion && typeof payload.emotion === 'object' && !Array.isArray(payload.emotion)) {
      if (typeof payload.emotion.name === 'string') {
        const normalized = normalizeEmotionName(payload.emotion.name)
        if (normalized) {
          const intensity = normalizeIntensity(payload.emotion.intensity)
          results.push({ name: normalized, intensity })
        }
      }
    }
    else if (typeof payload?.emotion === 'string') {
      const normalized = normalizeEmotionName(payload.emotion)
      if (normalized) {
        results.push({ name: normalized, intensity: 1 })
      }
    }

    // 2. LLM dynamic-key format: { "happy": { name: "happy", intensity: 1 }, motion: "agent007" }
    // The emotion name IS the JSON key (e.g., "happy", "sad", "angry")
    if (results.length === 0) {
      for (const key of Object.keys(payload)) {
        if (key === 'motion' || key === 'emotion')
          continue
        const val = payload[key]
        if (typeof val === 'object' && val?.name) {
          const normalized = normalizeEmotionName(val.name)
          if (normalized) {
            const intensity = normalizeIntensity(val.intensity)
            results.push({ name: normalized, intensity })
          }
          break
        }
        // Simple string value: { "happy": 1 } means intensity
        if (typeof val === 'number') {
          const normalized = normalizeEmotionName(key)
          if (normalized) {
            results.push({ name: normalized, intensity: normalizeIntensity(val) })
          }
          break
        }
      }
    }

    // 3. Motion string (VRMA animation cue — only add if not already an emotion)
    if (typeof payload?.motion === 'string') {
      const normalized = normalizeEmotionName(payload.motion)
      if (normalized && !results.some(r => r.name === normalized)) {
        results.push({ name: normalized, intensity: 1 })
      }
    }

    return results
  }

  function parseActEmotion(content: string) {
    const match = /<\|ACT\s*(?::\s*)?([\s\S]*?)(?:\|>|>)/i.exec(content)
    if (!match)
      return { ok: false, emotions: [] as EmotionPayload[] }

    const payloadText = match[1].trim()
    let emotions: EmotionPayload[] = []

    // Attempt 1: Strict JSON parse — expects standard {"emotion":{...},"motion":"..."}
    try {
      const payload = JSON.parse(payloadText)
      emotions = extractEmotions(payload)
    }
    catch {
      // Attempt 2: Wrap in braces — handles "happy":{...},"motion":"agent007" → {"happy":{...},"motion":"agent007"}
      // extractEmotions now handles dynamic emotion keys (e.g., "happy" as the JSON key)
      try {
        const wrapped = JSON.parse(`{${payloadText}}`)
        emotions = extractEmotions(wrapped)
      }
      catch { /* ignore */ }
    }

    return { ok: emotions.length > 0, emotions }
  }

  function parseDelay(content: string) {
    const match = /<\|DELAY:\s*(\d+)\s*(?:\|>|>)/i.exec(content)
    if (!match)
      return null
    const delay = Number.parseFloat(match[1])
    return Number.isNaN(delay) ? 0 : delay
  }

  return createQueue<string>({
    handlers: [
      async (ctx) => {
        // 1. Check for Delay
        const delay = parseDelay(ctx.data)
        if (delay !== null) {
          ctx.emit('delay', delay)
          await sleep(delay * 1000)
          return
        }

        // 2. Check for Emotion/Motion
        const actParsed = parseActEmotion(ctx.data)
        if (actParsed.ok) {
          for (const emotion of actParsed.emotions) {
            // Trace log for debugging
            // eslint-disable-next-line no-console
            console.log('[Queue] Dispatching ACT payload:', emotion)
            ctx.emit('emotion', emotion)
            emotionsQueue.enqueue(emotion)
          }
        }
      },
    ],
  })
}
