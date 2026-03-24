import type { ArtistryJob, ArtistryJobStatus, ArtistryProvider, ArtistryRequest } from './base'

import Replicate from 'replicate'

import { useLogg } from '@guiiai/logg'

const log = useLogg('replicate-provider').useGlobalConfig()

export class ReplicateProvider implements ArtistryProvider {
  readonly id = 'replicate'
  readonly name = 'Replicate.ai (Cloud)'

  private apiKey = ''
  private defaultModel = 'black-forest-labs/flux-schnell'
  private aspectRatio = '16:9'
  private inferenceSteps = 4
  private replicate: Replicate | null = null

  private jobResults = new Map<string, ArtistryJobStatus>()
  private callbacks = new Map<string, (status: ArtistryJobStatus) => void>()

  setJobCallback(jobId: string, callback: (status: ArtistryJobStatus) => void) {
    this.callbacks.set(jobId, callback)
    const result = this.jobResults.get(jobId)
    if (result)
      callback(result)
  }

  private updateStatus(jobId: string, status: ArtistryJobStatus) {
    this.jobResults.set(jobId, status)
    const callback = this.callbacks.get(jobId)
    if (callback)
      callback(status)
  }

  async initialize(config: any): Promise<void> {
    if (config?.replicateApiKey) {
      this.apiKey = config.replicateApiKey
      this.replicate = new Replicate({ auth: this.apiKey })
    }
    if (config?.replicateDefaultModel)
      this.defaultModel = config.replicateDefaultModel
    if (config?.replicateAspectRatio)
      this.aspectRatio = config.replicateAspectRatio
    if (config?.replicateInferenceSteps)
      this.inferenceSteps = config.replicateInferenceSteps
  }

  async generate(request: ArtistryRequest): Promise<ArtistryJob> {
    if (!this.replicate) {
      throw new Error('Replicate provider is not configured. Missing API Key.')
    }

    const model = (request.model || request.extra?.model || this.defaultModel) as `${string}/${string}`
    const inputOptions = {
      prompt: request.prompt || '',
      go_fast: request.extra?.go_fast ?? true,
      megapixels: request.extra?.megapixels ?? '1',
      num_outputs: request.extra?.num_outputs ?? 1,
      aspect_ratio: request.extra?.aspect_ratio ?? this.aspectRatio,
      output_format: request.extra?.output_format ?? 'jpg',
      output_quality: request.extra?.output_quality ?? 80,
      num_inference_steps: request.extra?.num_inference_steps ?? this.inferenceSteps,
      ...request.extra?.providerOptions, // Allow direct passthrough from AiriCard options
    }

    log.log(`[Replicate] Generating with model ${model} (Inputs: ${JSON.stringify(inputOptions)})`)

    // We don't await the result here because the interface expects us to return an ArtistryJob immediately.
    // However, replicate.run() blocks until completion. We'll run it in the background and store the result.
    const jobId = request.extra?.internalJobId || Math.random().toString(36).slice(2)

    // Start generation asynchronously
    this.runGeneration(jobId, model, inputOptions)

    return { jobId, providerJobId: jobId }
  }

  private async runGeneration(jobId: string, model: `${string}/${string}`, input: object) {
    this.updateStatus(jobId, { status: 'running', actionLabel: 'Requesting cloud generation...' })

    try {
      const output = await this.replicate!.run(model, { input })

      if (!output) {
        throw new Error('No output received from Replicate.')
      }

      log.log(`[Replicate] Raw output type: ${typeof output}, isArray: ${Array.isArray(output)}`)

      // Replicate's run() can return a single string, an array of strings, or an array of FileUpload objects
      const items = Array.isArray(output) ? output : [output]
      if (items.length > 0) {
        const first = items[0]
        let imageUrl: string | undefined

        // Case 1: FileUpload object with .url() method (common in recent SDK versions)
        if (typeof first === 'object' && first !== null && 'url' in first && typeof (first as any).url === 'function') {
          imageUrl = (first as any).url().href
        }
        // Case 2: Object with url property as a string
        else if (typeof first === 'object' && first !== null && 'url' in first && typeof (first as any).url === 'string') {
          imageUrl = (first as any).url
        }
        // Case 3: Simple string (the URL itself)
        else if (typeof first === 'string') {
          imageUrl = first
        }

        if (imageUrl && imageUrl.startsWith('http')) {
          log.log(`[Replicate] EXTRACTED IMAGE: ${imageUrl}`)
          this.updateStatus(jobId, { status: 'succeeded', progress: 100, imageUrl })
        }
        else {
          log.error(`[Replicate] Failed to extract URL from output: ${JSON.stringify(first)}`)
          throw new Error('Output does not contain a recognizable image URL.')
        }
      }
      else {
        throw new Error('Replicate returned an empty output array.')
      }
    }
    catch (error: any) {
      const errorMessage = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error))
      log.error(`[Replicate] Generation Failed for ${jobId}: ${errorMessage}`)
      this.updateStatus(jobId, {
        status: 'failed',
        error: errorMessage,
        actionLabel: `Error: ${errorMessage.slice(0, 50)}${errorMessage.length > 50 ? '...' : ''}`,
      })
    }
    finally {
      // Clean up callback after completion
      setTimeout(() => this.callbacks.delete(jobId), 10000)
    }
  }

  async getStatus(jobId: string): Promise<ArtistryJobStatus> {
    return this.jobResults.get(jobId) || { status: 'queued' }
  }
}
