import readline from 'node:readline';

const mode = process.argv[2] ?? 'normal';
const input = readline.createInterface({ input: process.stdin });

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
      // 'normal': echo back whatever protocolVersion the client requested.
      result = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: request.params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake', version: '1.0.0' },
        },
      };
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (request.method === 'tools/list') {
    process.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: { tools: [{ name: 'echo', description: 'Echoes input', inputSchema: { type: 'object' } }] },
    })}\n`);
  }
});
