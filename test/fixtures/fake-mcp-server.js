import readline from 'node:readline';

const mode = process.argv[2] ?? 'normal';
const input = readline.createInterface({ input: process.stdin });

const RESOURCES_PROMPTS_MODES = [
  'with-resources-prompts',
  'broken-resources',
  'broken-prompts',
  'with-resource-templates',
  'broken-resource-templates',
];

const capabilitiesFor = (mode) => {
  if (RESOURCES_PROMPTS_MODES.includes(mode)) {
    return { tools: {}, resources: {}, prompts: {} };
  }
  return { tools: {} };
};

input.on('line', (line) => {
  const request = JSON.parse(line);
  if (mode === 'hang') return;
  if (request.method === 'initialize') {
    let result;
    if (mode === 'malformed') {
      // Missing capabilities entirely.
      result = { jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05' } };
    } else if (mode === 'no-protocol-version') {
      // Protocol violation: server never reports which version it negotiated.
      result = {
        jsonrpc: '2.0',
        id: request.id,
        result: { capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1.0.0' } },
      };
    } else if (mode === 'downgrade') {
      // Server always negotiates an older (but still client-supported) version.
      result = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake', version: '1.0.0' },
        },
      };
    } else if (mode === 'incompatible-version') {
      // Server negotiates a version this client doesn't support.
      result = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '1999-01-01',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake', version: '1.0.0' },
        },
      };
    } else {
      // 'normal' and the resources/prompts modes: echo back whatever
      // protocolVersion the client requested, and declare capabilities()
      // based on mode.
      result = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: request.params?.protocolVersion ?? '2024-11-05',
          capabilities: capabilitiesFor(mode),
          serverInfo: { name: 'fake', version: '1.0.0' },
        },
      };
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (request.method === 'tools/list') {
    if (mode === 'paginated-tools') {
      const cursor = request.params?.cursor;
      if (!cursor) {
        process.stdout.write(`${JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: { tools: [{ name: 'echo', description: 'Echoes input', inputSchema: { type: 'object' } }], nextCursor: 'page2' },
        })}\n`);
      } else if (cursor === 'page2') {
        process.stdout.write(`${JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: { tools: [{ name: 'second-tool', description: 'The second page', inputSchema: { type: 'object' } }] },
        })}\n`);
      }
      return;
    }
    if (mode === 'paginated-tools-broken-page-2') {
      const cursor = request.params?.cursor;
      if (!cursor) {
        process.stdout.write(`${JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: { tools: [{ name: 'echo', description: 'Echoes input', inputSchema: { type: 'object' } }], nextCursor: 'page2' },
        })}\n`);
      } else {
        // Malformed page 2 (no tools array) — exercises the mid-pagination failure path.
        process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} })}\n`);
      }
      return;
    }
    if (mode === 'paginated-tools-infinite') {
      // Never stops returning a nextCursor — exercises the runaway-pagination guard.
      process.stdout.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: { tools: [{ name: 'echo', description: 'Echoes input', inputSchema: { type: 'object' } }], nextCursor: 'again' },
      })}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: { tools: [{ name: 'echo', description: 'Echoes input', inputSchema: { type: 'object' } }] },
    })}\n`);
  } else if (request.method === 'resources/list') {
    if (mode === 'broken-resources') {
      // Declares the resources capability but returns a malformed response
      // (no resources array) — exercises the soft-fail path.
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} })}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        resources: [
          { uri: 'file:///tmp/notes.txt', name: 'notes', description: 'Scratch notes', mimeType: 'text/plain' },
        ],
      },
    })}\n`);
  } else if (request.method === 'resources/templates/list') {
    if (mode === 'with-resource-templates') {
      process.stdout.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resourceTemplates: [
            { uriTemplate: 'file:///tmp/{name}.txt', name: 'scratch-file', description: 'A scratch file by name.' },
          ],
        },
      })}\n`);
      return;
    }
    if (mode === 'broken-resource-templates') {
      // Declares resources capability but returns a malformed templates
      // response (no resourceTemplates array) — exercises the soft-fail path.
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} })}\n`);
      return;
    }
    // Realistic default: most servers that support resources/list never
    // implement the optional resources/templates/list RPC at all.
    process.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32601, message: 'Method not found' },
    })}\n`);
  } else if (request.method === 'prompts/list') {
    if (mode === 'broken-prompts') {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} })}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        prompts: [{ name: 'summarize', description: 'Summarize the input', arguments: [{ name: 'text', required: true }] }],
      },
    })}\n`);
  }
});
