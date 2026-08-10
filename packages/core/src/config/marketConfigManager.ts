import fs from 'fs';
import yaml from 'yaml';
import { getPath } from './paths';

export function loadMarketKeys(): Record<string, string> {
  const MARKET_KEYS_FILE = getPath('market_keys.yaml');
  if (!fs.existsSync(MARKET_KEYS_FILE)) {
    return {};
  }
  try {
    const file = fs.readFileSync(MARKET_KEYS_FILE, 'utf8');
    const parsed = yaml.parse(file) || {};
    return parsed;
  } catch (error) {
    console.error('[Config] Failed to load market keys:', error);
    return {};
  }
}

export function saveMarketKeys(keys: Record<string, string>, overwrite: boolean = false): void {
  try {
    let updated;
    if (overwrite) {
      updated = { ...keys };
    } else {
      const existing = loadMarketKeys();
      updated = { ...existing, ...keys };
    }
    
    // Remove empty values
    for (const k in updated) {
      if (!updated[k] || updated[k].trim() === '') {
        delete updated[k];
      }
    }

    const MARKET_KEYS_FILE = getPath('market_keys.yaml');
    fs.writeFileSync(MARKET_KEYS_FILE, yaml.stringify(updated), 'utf8');
  } catch (error) {
    console.error('[Config] Failed to save market keys:', error);
    throw error;
  }
}



