import { GATT_FTMS_SERVICE } from './constants';
import { FTMSProtocol } from './protocol-ftms';
import { StandardProtocol } from './protocol-standard';
import type { ProtocolName, WalkingPadProtocol } from './types';

/**
 * Checks if a UUID matches the FTMS service.
 * Handles both short (4 hex chars) and full (128-bit) Bluetooth Base UUIDs.
 * Full UUID format: 0000XXXX-0000-1000-8000-00805f9b34fb where XXXX is the short ID.
 */
function isFtmsServiceUuid(uuid: string): boolean {
  const normalized = uuid.toLowerCase();
  const shortId = GATT_FTMS_SERVICE.toLowerCase();

  // Direct match for short UUID
  if (normalized === shortId) {
    return true;
  }

  // For full UUIDs, the short ID must appear at position 4-8 (after '0000')
  // Format: 0000XXXX-0000-1000-8000-00805f9b34fb
  if (normalized.length === 36 && normalized.charAt(8) === '-') {
    const extractedShortId = normalized.substring(4, 8);
    return extractedShortId === shortId;
  }

  return false;
}

export function detectProtocol(serviceUuids: string[]): ProtocolName {
  for (const uuid of serviceUuids) {
    if (isFtmsServiceUuid(uuid)) {
      return 'ftms';
    }
  }
  return 'standard';
}

const protocolCache: { standard?: StandardProtocol; ftms?: FTMSProtocol } = {};

export function getProtocol(name: ProtocolName): WalkingPadProtocol {
  if (name === 'ftms') {
    if (!protocolCache.ftms) {
      protocolCache.ftms = new FTMSProtocol();
    }
    return protocolCache.ftms;
  } else {
    if (!protocolCache.standard) {
      protocolCache.standard = new StandardProtocol();
    }
    return protocolCache.standard;
  }
}
