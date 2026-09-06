import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

/**
 * Inspects only what `resources/list` and `resources/templates/list` already
 * returned (see MCPConnection.resources/resourceTemplates, populated
 * passively in src/protocol/connect.ts). Never calls `resources/read` —
 * that would be real content retrieval, out of scope for a passive `check`.
 */
export const qualityResourcesCheck: Check = {
  id: 'quality.resource',
  description: 'Flags duplicate/empty resource(-template) URIs, missing required names, and other resources/list quality issues.',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      const resources = connection.resources;
      if (Array.isArray(resources)) {
        const byUri = new Map<string, number>();
        for (const resource of resources) {
          const uri = resource.uri;

          if (typeof uri !== 'string' || uri.trim() === '') {
            results.push({
              checkId: 'quality.resource',
              severity: 'error',
              message: 'Resource has an empty or invalid "uri" — the MCP spec requires resources to have a URI.',
              serverName: connection.server.name,
              category: 'schema',
              details: { resource },
            });
            continue;
          }

          byUri.set(uri, (byUri.get(uri) ?? 0) + 1);

          // Per the MCP spec's Resource type (extends BaseMetadata), "name" is
          // a required field, not optional.
          if (!resource.name || resource.name.trim() === '') {
            results.push({
              checkId: 'quality.resource',
              severity: 'error',
              message: `Resource "${uri}" is missing a "name" — required by the MCP spec's Resource type.`,
              serverName: connection.server.name,
              category: 'schema',
              details: { uri },
              suggestedFix: { description: `Add a "name" field to the resource at "${uri}".` },
            });
          }

          // description is optional per spec — absence is a quality
          // recommendation, not a violation.
          if (!resource.description || resource.description.trim() === '') {
            results.push({
              checkId: 'quality.resource',
              severity: 'info',
              message: `Resource "${uri}" has no description, making it harder for an agent to know when to read it.`,
              serverName: connection.server.name,
              category: 'quality',
              details: { uri },
            });
          }

          if (resource.size !== undefined && (typeof resource.size !== 'number' || resource.size < 0)) {
            results.push({
              checkId: 'quality.resource',
              severity: 'warning',
              message: `Resource "${uri}" declares an invalid "size" (${JSON.stringify(resource.size)}) — size must be a non-negative number.`,
              serverName: connection.server.name,
              category: 'schema',
              details: { uri, size: resource.size },
            });
          }
        }

        for (const [uri, count] of byUri) {
          if (count > 1) {
            results.push({
              checkId: 'quality.resource',
              severity: 'error',
              message: `Resource URI "${uri}" is declared ${count} times — resource URIs must be unique.`,
              serverName: connection.server.name,
              category: 'schema',
              details: { uri, duplicateCount: count },
            });
          }
        }
      }

      const templates = connection.resourceTemplates;
      if (Array.isArray(templates)) {
        const byUriTemplate = new Map<string, number>();
        for (const template of templates) {
          const uriTemplate = template.uriTemplate;

          if (typeof uriTemplate !== 'string' || uriTemplate.trim() === '') {
            results.push({
              checkId: 'quality.resource',
              severity: 'error',
              message: 'Resource template has an empty or invalid "uriTemplate" — the MCP spec requires resource templates to have one.',
              serverName: connection.server.name,
              category: 'schema',
              details: { template },
            });
            continue;
          }

          byUriTemplate.set(uriTemplate, (byUriTemplate.get(uriTemplate) ?? 0) + 1);

          // Per the MCP spec's ResourceTemplate type (extends BaseMetadata),
          // "name" is a required field, not optional.
          if (!template.name || template.name.trim() === '') {
            results.push({
              checkId: 'quality.resource',
              severity: 'error',
              message: `Resource template "${uriTemplate}" is missing a "name" — required by the MCP spec's ResourceTemplate type.`,
              serverName: connection.server.name,
              category: 'schema',
              details: { uriTemplate },
              suggestedFix: { description: `Add a "name" field to the resource template "${uriTemplate}".` },
            });
          }

          // description is optional per spec — absence is a quality
          // recommendation, not a violation.
          if (!template.description || template.description.trim() === '') {
            results.push({
              checkId: 'quality.resource',
              severity: 'info',
              message: `Resource template "${uriTemplate}" has no description, making it harder for an agent to know when to use it.`,
              serverName: connection.server.name,
              category: 'quality',
              details: { uriTemplate },
            });
          }
        }

        for (const [uriTemplate, count] of byUriTemplate) {
          if (count > 1) {
            results.push({
              checkId: 'quality.resource',
              severity: 'error',
              message: `Resource template "${uriTemplate}" is declared ${count} times — resource template URIs must be unique.`,
              serverName: connection.server.name,
              category: 'schema',
              details: { uriTemplate, duplicateCount: count },
            });
          }
        }
      }
    } catch (err) {
      results.push({
        checkId: 'quality.resource',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
        category: 'quality',
      });
    }
    return results;
  },
};
