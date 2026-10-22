import { pingSupabase } from './supabase';

let connected = false;

export async function connectDB(): Promise<void> {
  try {
    await pingSupabase();
    connected = true;
    // eslint-disable-next-line no-console
    console.log('[db] Supabase connected');
  } catch (err) {
    connected = false;
    // eslint-disable-next-line no-console
    console.error('[db] Supabase connection error:', (err as Error).message);
    throw err;
  }
}

export async function disconnectDB(): Promise<void> {
  connected = false;
}

export function isDBConnected(): boolean {
  return connected;
}
