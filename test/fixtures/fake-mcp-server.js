import readline from 'node:readline';

const mode = process.argv[2] ?? 'normal';
const input = readline.createInterface({ input: process.stdin });

input.on('line', (line) => {
  const request = JSON.parse(line);
  if (mode === 'hang') return;
  if (request.method === 'initialize') {
    const result = mode === 'malformed'
      ? { jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05' } }
      : {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'fake', version: '1.0.0' },
          },
        };
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (request.method === 'tools/list') {
    process.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: { tools: [{ name: 'echo', description: 'Echoes input', inputSchema: { type: 'object' } }] },
    })}\n`);
  }
});
