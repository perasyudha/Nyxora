import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadConfig } from '../config/parser';
import { pluginManager } from './registry';

const activeClients: Map<string, Client> = new Map();
const registeredToolNames = new Set<string>();

function parseMcpSseResponse(rawText: string): any {
  try {
    return JSON.parse(rawText);
  } catch (e) {
    const lines = rawText.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          return JSON.parse(line.substring(6));
        } catch (_) {}
      }
    }
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw e;
  }
}

export async function initializeMcpServers(): Promise<void> {
  const config = loadConfig();
  const mcpServers = config.mcp_servers || {};

  for (const [serverName, cfg] of Object.entries(mcpServers)) {
    if (!cfg || cfg.disabled) continue;

    // ── HTTP / SSE MCP Server Support (e.g. OpenSea MCP, Remote Endpoints) ──
    if (cfg.url) {
      try {
        console.log(`[MCP] Connecting to HTTP/SSE server '${serverName}' (${cfg.url})...`);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          ...(cfg.headers || {})
        };

        // Step 1: Initialize session
        const initRes = await fetch(cfg.url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'nyxora-agent', version: '26.8.9' }
            }
          })
        });

        const sessionId = initRes.headers.get('mcp-session-id');
        const sessionHeaders: Record<string, string> = {
          ...headers,
          ...(sessionId ? { 'mcp-session-id': sessionId } : {})
        };

        // Step 2: List tools
        const toolsRes = await fetch(cfg.url, {
          method: 'POST',
          headers: sessionHeaders,
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
        });

        const toolsText = await toolsRes.text();
        const toolsData = parseMcpSseResponse(toolsText);
        const rawTools = toolsData.result?.tools || [];

        const tools: any[] = [];
        const handlers: Record<string, (args: any, context?: any) => Promise<any>> = {};

        for (const tool of rawTools) {
          const cleanServerName = serverName.replace(/[^a-zA-Z0-9_]/g, '_');
          const cleanToolName = tool.name.replace(/[^a-zA-Z0-9_]/g, '_');

          let fullToolName = `mcp_${cleanToolName}`;
          if (registeredToolNames.has(fullToolName)) {
            fullToolName = `mcp_${cleanServerName}_${cleanToolName}`;
          }
          registeredToolNames.add(fullToolName);

          tools.push({
            type: "function",
            function: {
              name: fullToolName,
              description: `[MCP Server: ${serverName}] ${tool.description || tool.name}`,
              parameters: tool.inputSchema || { type: "object", properties: {} }
            }
          });

          handlers[fullToolName] = async (args: any) => {
            try {
              const callRes = await fetch(cfg.url, {
                method: 'POST',
                headers: sessionHeaders,
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: Date.now(),
                  method: 'tools/call',
                  params: {
                    name: tool.name,
                    arguments: args || {}
                  }
                })
              });
              const callText = await callRes.text();
              const callData = parseMcpSseResponse(callText);

              if (callData.result?.content && Array.isArray(callData.result.content)) {
                return callData.result.content.map((c: any) => c.text || JSON.stringify(c)).join('\n');
              }
              return JSON.stringify(callData.result || callData);
            } catch (err: any) {
              return `Error executing MCP tool ${fullToolName}: ${err.message}`;
            }
          };
        }

        pluginManager.register({
          name: `mcp-${serverName}`,
          version: "1.0.0",
          description: `External MCP tools from HTTP server '${serverName}'`,
          tools,
          handlers
        });

        console.log(`[MCP] Registered ${tools.length} HTTP tools from server '${serverName}'`);
      } catch (err: any) {
        console.error(`[MCP] Failed to connect to HTTP server '${serverName}':`, err.message);
      }
      continue;
    }

    // ── Stdio MCP Server Support (Local Commands via stdio) ──
    if (!cfg.command) continue;
    try {
      console.log(`[MCP] Connecting to server '${serverName}' (${cfg.command} ${(cfg.args || []).join(' ')})...`);
      const transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args || [],
        env: { ...process.env, ...(cfg.env || {}) } as any
      });

      const client = new Client({
        name: "nyxora-agent",
        version: "26.8.4"
      }, {
        capabilities: {}
      });

      await client.connect(transport);
      activeClients.set(serverName, client);

      const toolsRes = await client.listTools();
      if (!toolsRes || !toolsRes.tools) continue;

      const tools: any[] = [];
      const handlers: Record<string, (args: any, context?: any) => Promise<any>> = {};

      for (const tool of toolsRes.tools) {
        const cleanServerName = serverName.replace(/[^a-zA-Z0-9_]/g, '_');
        const cleanToolName = tool.name.replace(/[^a-zA-Z0-9_]/g, '_');
        
        // Prefer short name mcp_{toolName} for UI readability, unless there is a collision
        let fullToolName = `mcp_${cleanToolName}`;
        if (registeredToolNames.has(fullToolName)) {
          fullToolName = `mcp_${cleanServerName}_${cleanToolName}`;
        }
        registeredToolNames.add(fullToolName);

        tools.push({
          type: "function",
          function: {
            name: fullToolName,
            description: `[MCP Server: ${serverName}] ${tool.description || tool.name}`,
            parameters: tool.inputSchema || { type: "object", properties: {} }
          }
        });

        handlers[fullToolName] = async (args: any, _context?: any) => {
          try {
            const res = await client.callTool({
              name: tool.name,
              arguments: args || {}
            });
            if (res.content && Array.isArray(res.content)) {
              return res.content.map((c: any) => c.text || JSON.stringify(c)).join('\n');
            }
            return JSON.stringify(res);
          } catch (err: any) {
            return `Error executing MCP tool ${fullToolName}: ${err.message}`;
          }
        };
      }

      pluginManager.register({
        name: `mcp-${serverName}`,
        version: "1.0.0",
        description: `External MCP tools from server '${serverName}'`,
        tools,
        handlers
      });

      console.log(`[MCP] Registered ${tools.length} tools from server '${serverName}'`);
    } catch (err: any) {
      console.error(`[MCP] Failed to connect to server '${serverName}':`, err.message);
    }
  }
}
