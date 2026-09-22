import {execFileSync} from 'node:child_process';
const assert=(ok,message)=>{if(!ok)throw new Error(message);};

export function getKey() {
  if (process.env.TYPESAFE_API_KEY?.trim()) return process.env.TYPESAFE_API_KEY.trim();
  try {
    return execFileSync('/usr/bin/security', ['find-generic-password', '-s', process.env.TYPESAFE_KEYCHAIN_SERVICE || 'typesafe-ai-project-test', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }).trim();
  } catch {
    throw new Error('TypeSafe key unavailable: set TYPESAFE_API_KEY or unlock the configured macOS Keychain item');
  }
}

export async function provider(path, payload) {
  const key = getKey();
  assert(key.length > 0, 'Empty TypeSafe key');
  let response;
  try {
    response = await fetch(`https://api.typesafe.ai/v1/${path}`, {
      method: payload ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      redirect: 'error', signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error('TypeSafe network request failed or timed out. No automatic retry was sent.');
  }
  if (!response.ok) throw new Error(`TypeSafe HTTP ${response.status}. No automatic retry was sent.`);
  return response.json();
}
