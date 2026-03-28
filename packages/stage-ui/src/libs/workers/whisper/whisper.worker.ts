import { env, pipeline } from '@huggingface/transformers'

// Initialize environment for browser usage (WebGPU/WASM)
env.allowLocalModels = false
env.useBrowserCache = true

// Cache for pipelines
const pipelines: Record<string, any> = {}

async function getPipeline(model: string, progress_callback?: (progress: number) => void) {
  if (pipelines[model])
    return pipelines[model]

  console.info(`[Whisper Worker] Loading model: ${model}`)
  try {
    // Try WebGPU first if available
    pipelines[model] = await pipeline('automatic-speech-recognition', model, {
      device: 'webgpu',
      dtype: 'fp16', // Better for WebGPU
      progress_callback: (info: any) => {
        if (info.status === 'progress' && progress_callback) {
          progress_callback(info.progress)
        }
      },
    })
    console.info(`[Whisper Worker] Model ${model} loaded with WebGPU`)
  }
  catch (err) {
    console.warn(`[Whisper Worker] WebGPU failed, falling back to WASM:`, err)
    pipelines[model] = await pipeline('automatic-speech-recognition', model, {
      device: 'wasm',
      dtype: 'fp32', // Safe default for WASM
      progress_callback: (info: any) => {
        if (info.status === 'progress' && progress_callback) {
          progress_callback(info.progress)
        }
      },
    })
    console.info(`[Whisper Worker] Model ${model} loaded with WASM`)
  }

  return pipelines[model]
}

let transcriber: any = null

/**
 * Ensures the input audio is a Float32Array and properly normalized for Whisper.
 * Handles ArrayBuffer, TypedArrays, and common PCM formats (Int16/Float32).
 */
function ensureFloat32Array(audio: any): Float32Array {
  if (audio instanceof Float32Array) {
    return audio
  }

  // If it's another TypedArray, we need to convert it
  if (ArrayBuffer.isView(audio)) {
    if (audio instanceof Int16Array) {
      console.info(`[Whisper Worker] Converting Int16Array (${audio.length} samples) to Float32Array`)
      const f32 = new Float32Array(audio.length)
      for (let i = 0; i < audio.length; ++i) {
        f32[i] = audio[i] / 32768.0
      }
      return f32
    }
    // Fallback for other typed arrays
    return new Float32Array(audio.buffer, audio.byteOffset, Math.floor(audio.byteLength / 4))
  }

  if (audio instanceof ArrayBuffer) {
    const byteLength = audio.byteLength

    // Detection heuristic: the hearingStore in this repo sends Int16 ArrayBuffers (pcm16.buffer.slice(0))
    // Int16 is 2 bytes per sample. Float32 is 4 bytes.
    // If it's not a multiple of 4 but is a multiple of 2, it's almost certainly Int16.
    if (byteLength % 2 === 0 && byteLength % 4 !== 0) {
      console.info(`[Whisper Worker] Detected Int16 samples (length: ${byteLength} bytes). Converting to Float32...`)
      const i16 = new Int16Array(audio)
      const f32 = new Float32Array(i16.length)
      for (let i = 0; i < i16.length; ++i) {
        f32[i] = i16[i] / 32768.0
      }
      return f32
    }

    // Default to Float32, but handle unaligned buffers safely to avoid RangeError
    const floatCount = Math.floor(byteLength / 4)
    if (byteLength % 4 !== 0) {
      console.warn(`[Whisper Worker] Audio buffer length (${byteLength}) is not a multiple of 4. Truncating trailing bytes.`)
    }
    return new Float32Array(audio, 0, floatCount)
  }

  if (Array.isArray(audio)) {
    return new Float32Array(audio)
  }

  throw new Error(`Unsupported audio data type: ${audio?.constructor?.name || typeof audio}`)
}

self.onmessage = async (event: MessageEvent) => {
  const { type, id, model, modelId, audio, audioData, options, payload } = event.data

  // Support both direct props and payload for flexibility during transition
  const effectiveModelId = modelId || model || payload?.modelId || payload?.model
  const effectiveId = id || payload?.id
  const effectiveType = type?.toUpperCase()

  console.info(`[Whisper Worker] Received message: ${effectiveType}`, { id: effectiveId, modelId: effectiveModelId })

  switch (effectiveType) {
    case 'CHECK-CACHE': {
      try {
        console.group(`[Whisper Worker] Checking cache for ${effectiveModelId}`)
        const cache = await caches.open('transformers-cache')
        const keys = await cache.keys()
        const isCached = keys.some(k => k.url.includes(effectiveModelId))
        console.info(`[Whisper Worker] Cache status: ${isCached ? 'FOUND' : 'NOT FOUND'}`)
        self.postMessage({ type: 'CACHE-STATUS', id: effectiveId, modelId: effectiveModelId, isCached })
        console.groupEnd()
      }
      catch (err) {
        console.error('[Whisper Worker] Cache check failed:', err)
        if (err instanceof Error) {
          console.error(err.stack)
        }
        self.postMessage({ type: 'CACHE-STATUS', id: effectiveId, modelId: effectiveModelId, isCached: false })
      }
      break
    }

    case 'LOAD': {
      try {
        console.group(`[Whisper Worker] Loading model: ${effectiveModelId}`)
        self.postMessage({ type: 'PROGRESS', id: effectiveId, progress: 0 })

        transcriber = await getPipeline(effectiveModelId, (progress) => {
          console.info(`[Whisper Worker] Loading progress: ${(progress * 100).toFixed(2)}%`)
          self.postMessage({ type: 'PROGRESS', id: effectiveId, progress })
        })

        console.info(`[Whisper Worker] Model ${effectiveModelId} loaded successfully.`)
        self.postMessage({ type: 'LOADED', id: effectiveId })
        console.groupEnd()
      }
      catch (error) {
        console.error('[Whisper Worker] Model load failed:', error)
        if (error instanceof Error) {
          console.error(error.stack)
        }
        self.postMessage({ type: 'ERROR', id: effectiveId, error: (error as Error).message, stack: (error as Error).stack })
        console.groupEnd()
      }
      break
    }

    case 'TRANSCRIBE': {
      const effectiveAudio = audio || audioData || payload?.audioData || payload?.audio
      const effectiveOptions = options || payload?.options || {}

      console.group(`[Whisper Worker] Transcription request ${effectiveId}`)

      if (!transcriber) {
        const errorMsg = 'Transcriber not initialized. Please ensure LOAD message is sent and completed before TRANSCRIBE.'
        console.error(`[Whisper Worker] ${errorMsg}`)
        self.postMessage({ type: 'ERROR', id: effectiveId, error: errorMsg })
        console.groupEnd()
        return
      }

      try {
        if (!effectiveAudio) {
          throw new Error('No audio data provided for transcription')
        }

        const byteLength = effectiveAudio.byteLength ?? effectiveAudio.length
        console.info(`[Whisper Worker] Processing ${byteLength} units of audio data...`)

        // Prepare audio data: convert any input format to normalized Float32Array
        const audioBuffer = ensureFloat32Array(effectiveAudio)

        console.info(`[Whisper Worker] Starting inference with ${audioBuffer.length} samples...`)

        const result = await transcriber(audioBuffer, {
          ...effectiveOptions,
          chunk_length_s: 30,
          stride_length_s: 5,
        })

        console.info(`[Whisper Worker] Transcription completed: "${result.text.substring(0, 50)}${result.text.length > 50 ? '...' : ''}"`)
        self.postMessage({ type: 'RESULT', id: effectiveId, text: result.text, chunks: result.chunks })
        console.groupEnd()
      }
      catch (err) {
        console.error('[Whisper Worker] Transcription failed:', err)
        if (err instanceof Error) {
          console.error(err.stack)
        }
        self.postMessage({
          type: 'ERROR',
          id: effectiveId,
          error: `Transcription failed: ${err instanceof Error ? err.message : String(err)}`,
          stack: err instanceof Error ? err.stack : undefined,
        })
        console.groupEnd()
      }
      break
    }

    default: {
      console.warn(`[Whisper Worker] Unknown message type: ${effectiveType}`)
    }
  }
}
