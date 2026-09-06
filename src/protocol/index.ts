import { registerConnectImpl } from '../orchestrator.js';
import { connect } from './connect.js';

export function registerProtocol(): void {
  registerConnectImpl(connect);
}

export { connect };
