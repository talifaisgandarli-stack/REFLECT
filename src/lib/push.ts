/**
 * Web Push client helpers — subscribe/unsubscribe the current device and sync
 * the subscription to the server (/api/push/subscribe). The service worker is
 * registered by vite-plugin-pwa; we reuse `navigator.serviceWorker.ready`.
 *
 * Needs VITE_VAPID_PUBLIC_KEY at build time (the server holds the private key).
 */
import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushConfigured(): boolean {
  return isPushSupported() && !!VAPID_PUBLIC;
}

export async function currentPushState(): Promise<'unsupported' | 'denied' | 'subscribed' | 'default'> {
  if (!pushConfigured()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) return 'subscribed';
  return 'default';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Request permission, subscribe this device, and store it on the server. */
export async function enablePush(): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!pushConfigured()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC as string) as BufferSource,
    });
  }

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) throw new Error('Abunə serverdə saxlanılmadı');
  return 'ok';
}

/** Unsubscribe this device and remove it from the server. */
export async function disablePush(): Promise<void> {
  if (!pushConfigured()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}
