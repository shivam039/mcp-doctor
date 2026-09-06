export { runChecks } from './orchestrator.js';
export { formatReportHuman, formatReportJSON } from './report.js';
export { loadConfig } from './config-loader.js';
export type { ConfigLoadResult } from './config-loader.js';
// Jules' src/checks/index.ts hasn't landed yet (still just .gitkeep) — add
// `export { allChecks } from './checks/index.js';` here once it does.
export * from './types.js';
