#!/usr/bin/env node

/**
 * CloudCDN MCP Server — entry point.
 *
 * Boots the server and attaches it to a stdio transport. This is the code
 * path that `npx @sebastienrousseau/cloudcdn-mcp` (or the `cloudcdn-mcp` binary)
 * executes when an MCP host (Claude Desktop, Cursor, Windsurf, etc.)
 * launches it.
 *
 * For programmatic embedding — custom transport, hosted MCP gateway,
 * integration tests — import `createServer` from `@sebastienrousseau/cloudcdn-mcp/server`
 * directly and skip this file.
 *
 * @module @sebastienrousseau/cloudcdn-mcp
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
