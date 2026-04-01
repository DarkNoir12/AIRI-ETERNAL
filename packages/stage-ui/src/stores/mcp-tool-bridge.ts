export interface McpToolDescriptor {
  serverName: string
  name: string
  toolName: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface McpCallToolPayload {
  name: string
  arguments?: Record<string, unknown>
}

export interface McpCallToolResult {
  content?: Array<Record<string, unknown>>
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
  isError?: boolean
}

export interface McpServerRuntimeStatus {
  name: string
  state: 'running' | 'stopped' | 'error'
  command: string
  args: string[]
  pid: number | null
  lastError?: string
}

export interface McpRuntimeStatus {
  path: string
  servers: McpServerRuntimeStatus[]
  updatedAt: number
}

interface McpToolBridge {
  listTools: () => Promise<McpToolDescriptor[]>
  callTool: (payload: McpCallToolPayload) => Promise<McpCallToolResult>
  getRuntimeStatus: () => Promise<McpRuntimeStatus>
}

let bridge: McpToolBridge | undefined

/**
 * Sets the MCP tool bridge for the current runtime.
 * Also exposes it globally on the `window` object to ensure cross-module
 * and cross-window stability in Electron's multi-renderer architecture.
 */
export function setMcpToolBridge(nextBridge: McpToolBridge) {
  bridge = nextBridge

  // Expose globally for cross-context stability
  if (typeof window !== 'undefined') {
    ;(window as any).__AIRI_MCP_BRIDGE__ = nextBridge
  }
}

export function clearMcpToolBridge() {
  bridge = undefined
  if (typeof window !== 'undefined') {
    delete (window as any).__AIRI_MCP_BRIDGE__
  }
}

/**
 * Retrieves the MCP tool bridge.
 * Checks the module-level variable first, then falls back to the global
 * `window.__AIRI_MCP_BRIDGE__` to survive module duplication or window isolation.
 */
export function getMcpToolBridge(): McpToolBridge {
  const resolvedBridge = bridge || (typeof window !== 'undefined' ? (window as any).__AIRI_MCP_BRIDGE__ : undefined)

  if (!resolvedBridge) {
    throw new Error('MCP tool bridge is not available in this runtime.')
  }

  return resolvedBridge
}
