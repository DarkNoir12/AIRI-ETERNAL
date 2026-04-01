import { readFile } from 'node:fs/promises'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// --- MOCKED/COPIED FROM PROJECT ---

// From packages/stage-ui/src/stores/mcp-tool-bridge.ts
interface McpToolDescriptor {
  serverName: string
  name: string
  toolName: string
  description?: string
  inputSchema: Record<string, unknown>
}

// From packages/stage-ui/src/stores/modules/live-session.ts (Hardened Logic)
function mapAiriToolToGemini(tool: any): Record<string, unknown> {
  const params = tool.function.parameters ? JSON.parse(JSON.stringify(tool.function.parameters)) : { type: 'object', properties: {} }
  const cleanSchema = (obj: any) => {
    if (!obj || typeof obj !== 'object')
      return
    delete obj.$schema
    delete obj.additionalProperties
    if (obj.properties) {
      Object.values(obj.properties).forEach(cleanSchema)
    }
    if (obj.items) {
      cleanSchema(obj.items)
    }
  }
  cleanSchema(params)
  if (params.type !== 'object')
    params.type = 'object'
  if (!params.properties)
    params.properties = {}
  return {
    name: tool.function.name,
    description: tool.function.description || '',
    parameters: params,
  }
}

// --- HARNESS LOGIC ---

async function runHarness() {
  const configPath = 'c:/Users/h4rdc/.gemini/antigravity/mcp_config.json'
  console.log(`[Harness] Reading config from ${configPath}...`)

  const configRaw = await readFile(configPath, 'utf-8')
  const config = JSON.parse(configRaw)

  const archivistConfig = config.mcpServers.archivist
  if (!archivistConfig) {
    throw new Error('Archivist server not found in config')
  }

  console.log(`[Harness] Starting archivist server: ${archivistConfig.command} ${archivistConfig.args.join(' ')}`)

  const transport = new StdioClientTransport({
    command: archivistConfig.command,
    args: archivistConfig.args,
    env: archivistConfig.env,
  })

  const client = new Client({
    name: 'harness-mcp-gemini',
    version: '1.0.0',
  })

  try {
    await client.connect(transport)
    console.log('[Harness] Connected to MCP server!')

    // 1. Simulate mcp_list_tools execute logic
    console.log('[Harness] Listing tools...')
    const response = await client.listTools()

    // Convert to project's McpToolDescriptor format
    const descriptors = response.tools.map(t => ({
      serverName: 'archivist',
      name: `archivist::${t.name}`,
      toolName: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))

    console.log(`[Harness] Found ${descriptors.length} tools.`)

    // 2. Simulate AIRI tool creation (xsai tool wrapper)
    // We'll just create a mock AIRI tool object for mcp_list_tools itself first
    const mcpListToolsAiri = {
      function: {
        name: 'mcp_list_tools',
        description: 'List all tools available on the connected MCP servers',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
      },
    }

    // 3. Test the mapping
    console.log('\n--- VERIFICATION: mcp_list_tools (Empty Params) ---')
    const purifiedList = mapAiriToolToGemini(mcpListToolsAiri)
    console.log(JSON.stringify(purifiedList, null, 2))

    // 4. Test a representative archivist tool
    if (descriptors.length > 0) {
      const firstTool = descriptors[0]
      console.log(`\n--- VERIFICATION: ${firstTool.name} ---`)
      const airiTool = {
        function: {
          name: firstTool.name,
          description: firstTool.description,
          parameters: firstTool.inputSchema,
        },
      }
      const purifiedArchivist = mapAiriToolToGemini(airiTool)
      console.log(JSON.stringify(purifiedArchivist, null, 2))
    }

    console.log('\n[Harness] All verification steps completed successfully!')
  }
  catch (err) {
    console.error('[Harness] Error:', err)
  }
  finally {
    await client.close()
  }
}

runHarness()
