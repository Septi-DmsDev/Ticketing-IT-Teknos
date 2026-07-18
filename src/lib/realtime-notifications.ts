import { supabase } from './supabase';

const STORAGE_KEY = 'it_notif_enabled';
const ICON = '/favicon.svg';

// =========================================================
// Permission & State Helpers
// =========================================================

export function isNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationState(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!isNotificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export function isNotificationEnabled(): boolean {
  try {
    return (
      localStorage.getItem(STORAGE_KEY) !== 'false' &&
      Notification.permission === 'granted'
    );
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationsSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    localStorage.setItem(STORAGE_KEY, 'true');
    return true;
  }
  return false;
}

export function disableNotifications(): void {
  localStorage.setItem(STORAGE_KEY, 'false');
}

// =========================================================
// Show Notification
// =========================================================

function showNotification(title: string, body: string, url: string) {
  if (!isNotificationEnabled()) return;

  try {
    const notif = new Notification(title, {
      body,
      icon: ICON,
      badge: ICON,
      tag: url,       // Deduplicate — same tag replaces old notification
      renotify: true,
      data: { url },
    } as any);

    notif.onclick = () => {
      window.focus();
      window.location.href = url;
      notif.close();
    };
  } catch (e) {
    console.warn('[Notifications] Gagal menampilkan notifikasi:', e);
  }
}

// =========================================================
// Live Badge Count
// =========================================================

export async function refreshSupportBadge() {
  try {
    const { count } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'assigned', 'in_progress']);

    const badge = document.getElementById('support-badge');
    if (!badge) return;

    if (count && count > 0) {
      badge.textContent = String(count);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch {
    // Silent fail — non-critical
  }
}

// =========================================================
// Realtime Subscription
// =========================================================

let _channel: ReturnType<typeof supabase.channel> | null = null;

export function startRealtimeNotifications() {
  if (_channel) return; // Already subscribed

  _channel = supabase.channel('admin-ticket-notifications');

  _channel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_tickets' },
      (payload) => {
        const t = payload.new as Record<string, string>;
        showNotification(
          '🔧 Tiket Support Baru!',
          `${t.reporter_name} · ${t.reporter_division}\n${t.category_name || '—'}`,
          `/admin/support/${t.ticket_code}`
        );
        refreshSupportBadge();
        dispatchEvent(new CustomEvent('it:new-ticket', { detail: { type: 'support', ticket: t } }));
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'feature_requests' },
      (payload) => {
        const r = payload.new as Record<string, string>;
        showNotification(
          '📋 Pengajuan Sistem Baru!',
          `${r.requester_name} · ${r.requester_division}\n${r.title}`,
          `/admin/pengajuan/${r.ticket_code}`
        );
        dispatchEvent(new CustomEvent('it:new-ticket', { detail: { type: 'request', ticket: r } }));
      }
    )
    .subscribe((status) => {
      console.info('[Realtime]', status);
    });
}

export function stopRealtimeNotifications() {
  if (_channel) {
    supabase.removeChannel(_channel);
    _channel = null;
  }
}
