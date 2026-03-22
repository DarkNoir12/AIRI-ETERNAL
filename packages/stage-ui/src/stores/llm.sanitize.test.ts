import { describe, expect, it } from 'vitest'

import { sanitizeMessages } from './llm'

describe('sanitizeMessages', () => {
  it('should flatten text-only content arrays for backward compatibility', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: ' world' },
        ],
      },
    ]

    const sanitized = sanitizeMessages(messages)
    expect(sanitized[0].content).toBe('Hello world')
    expect(typeof sanitized[0].content).toBe('string')
  })

  it('should keep content arrays if image_url is present and vision is not explicitly disabled', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } },
        ],
      },
    ]

    const sanitized = sanitizeMessages(messages)
    expect(Array.isArray(sanitized[0].content)).toBe(true)
    expect((sanitized[0].content as any)[1].type).toBe('image_url')
  })

  it('should strip images and replace with placeholder when vision is disabled', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Look at this:' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } },
          { type: 'text', text: 'Nice, right?' },
        ],
      },
    ]

    const sanitized = sanitizeMessages(messages, { vision: false })
    expect(typeof sanitized[0].content).toBe('string')
    expect(sanitized[0].content).toBe('Look at this: [Image] Nice, right?')
  })

  it('should handle assistant messages with images when vision is disabled', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I see an image:' },
          { type: 'image_url', image_url: { url: '...' } },
        ],
      },
    ]

    const sanitized = sanitizeMessages(messages, { vision: false })
    expect(sanitized[0].content).toBe('I see an image: [Image]')
  })

  it('should convert error roles to user messages', () => {
    const messages = [
      {
        role: 'error',
        content: 'Something went wrong',
      },
    ]

    const sanitized = sanitizeMessages(messages)
    expect(sanitized[0].role).toBe('user')
    expect(sanitized[0].content).toContain('User encountered error')
  })
})
