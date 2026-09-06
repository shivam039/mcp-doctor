export { malformedSchemaCheck } from './malformed-schema.js';
export { missingRequiredFieldsCheck } from './missing-required-fields.js';
export { typeMismatchCheck } from './type-mismatch.js';
export { missingDescriptionCheck } from './missing-description.js';
export { sampleCallSimulationCheck } from './sample-call-simulation.js';
export { securityUntrustedRemoteCheck } from './security-untrusted-remote.js';
export { securityOverbroadPermissionsCheck } from './security-overbroad-permissions.js';
export { securityPromptInjectionRiskCheck } from './security-prompt-injection-risk.js';

import { malformedSchemaCheck } from './malformed-schema.js';
import { missingRequiredFieldsCheck } from './missing-required-fields.js';
import { typeMismatchCheck } from './type-mismatch.js';
import { missingDescriptionCheck } from './missing-description.js';
import { sampleCallSimulationCheck } from './sample-call-simulation.js';
import { securityUntrustedRemoteCheck } from './security-untrusted-remote.js';
import { securityOverbroadPermissionsCheck } from './security-overbroad-permissions.js';
import { securityPromptInjectionRiskCheck } from './security-prompt-injection-risk.js';

export const allChecks = [
  malformedSchemaCheck,
  missingRequiredFieldsCheck,
  typeMismatchCheck,
  missingDescriptionCheck,
  sampleCallSimulationCheck,
  securityUntrustedRemoteCheck,
  securityOverbroadPermissionsCheck,
  securityPromptInjectionRiskCheck,
];
