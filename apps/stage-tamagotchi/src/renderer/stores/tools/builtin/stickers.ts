import type { Tool } from '@xsai/shared-chat'

import { useStickersStore } from '@proj-airi/stage-ui/stores/stickers'

/**
 * Tools for interacting with the sticker system.
 */
export function stickersTools(): Tool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'spawn_sticker',
        description: 'Spawns a sticker on the screen to express an emotion, reaction, or decoration. Use specific sticker IDs to choose the visual.',
        parameters: {
          type: 'object',
          properties: {
            stickerId: {
              type: 'string',
              description: 'The unique ID/label of the sticker to spawn.',
            },
            x: {
              type: 'number',
              description: 'Horizontal position (0-100 as percentage of screen width). Random if omitted.',
            },
            y: {
              type: 'number',
              description: 'Vertical position (0-100 as percentage of screen height). Random if omitted.',
            },
            duration: {
              type: 'integer',
              description: 'Lifespan in seconds before the sticker fades out. Default is 60s.',
            },
          },
          required: ['stickerId'],
        },
      },
      // @ts-expect-error - Custom implementation field
      async execute({ stickerId, x, y, duration }: { stickerId: string, x?: number, y?: number, duration?: number }) {
        const stickersStore = useStickersStore()
        const placement = stickersStore.spawnSticker(stickerId, { x, y, duration })

        if (placement && typeof placement === 'object') {
          const expirationInfo = duration ? ` for ${duration}s` : ''
          return `Successfully spawned sticker "${stickerId}"${expirationInfo} at (${Math.round((placement as any).x)}%, ${Math.round((placement as any).y)}%).`
        }
        else {
          return `Failed to spawn sticker "${stickerId}". Label not found in library.`
        }
      },
    },
  ]
}
