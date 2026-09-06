export { malformedSchemaCheck } from './malformed-schema.js';
export { missingRequiredFieldsCheck } from './missing-required-fields.js';
export { typeMismatchCheck } from './type-mismatch.js';
export { missingDescriptionCheck } from './missing-description.js';
export { sampleCallSimulationCheck } from './sample-call-simulation.js';
export { securityUntrustedRemoteCheck } from './security-untrusted-remote.js';
export { securityOverbroadPermissionsCheck } from './security-overbroad-permissions.js';
export { securityPromptInjectionRiskCheck } from './security-prompt-injection-risk.js';
export { qualityToolNamesCheck } from './quality-tool-names.js';
export { qualityToolDescriptionsCheck } from './quality-tool-descriptions.js';
export { qualityToolOutputSchemaCheck } from './quality-tool-output-schema.js';
export { qualityToolAnnotationsCheck } from './quality-tool-annotations.js';
export { qualityToolSurfaceCheck, createToolSurfaceCheck, DEFAULT_MAX_TOOLS_WARNING_THRESHOLD } from './quality-tool-surface.js';
export { qualityResourcesCheck } from './quality-resources.js';
export { qualityPromptsCheck } from './quality-prompts.js';

import { malformedSchemaCheck } from './malformed-schema.js';
import { missingRequiredFieldsCheck } from './missing-required-fields.js';
import { typeMismatchCheck } from './type-mismatch.js';
import { missingDescriptionCheck } from './missing-description.js';
import { sampleCallSimulationCheck } from './sample-call-simulation.js';
import { securityUntrustedRemoteCheck } from './security-untrusted-remote.js';
import { securityOverbroadPermissionsCheck } from './security-overbroad-permissions.js';
import { securityPromptInjectionRiskCheck } from './security-prompt-injection-risk.js';
import { qualityToolNamesCheck } from './quality-tool-names.js';
import { qualityToolDescriptionsCheck } from './quality-tool-descriptions.js';
import { qualityToolOutputSchemaCheck } from './quality-tool-output-schema.js';
import { qualityToolAnnotationsCheck } from './quality-tool-annotations.js';
import { qualityToolSurfaceCheck } from './quality-tool-surface.js';
import { qualityResourcesCheck } from './quality-resources.js';
import { qualityPromptsCheck } from './quality-prompts.js';

export const allChecks = [
  malformedSchemaCheck,
  missingRequiredFieldsCheck,
  typeMismatchCheck,
  missingDescriptionCheck,
  sampleCallSimulationCheck,
  securityUntrustedRemoteCheck,
  securityOverbroadPermissionsCheck,
  securityPromptInjectionRiskCheck,
  qualityToolNamesCheck,
  qualityToolDescriptionsCheck,
  qualityToolOutputSchemaCheck,
  qualityToolAnnotationsCheck,
  qualityToolSurfaceCheck,
  qualityResourcesCheck,
  qualityPromptsCheck,
];
