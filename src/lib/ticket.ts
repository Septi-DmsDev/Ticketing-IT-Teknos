import { supabase } from './supabase';

// =========================================================
// Types
// =========================================================

export type TicketType = 'support' | 'request';

export interface SupportTicketPayload {
  reporter_name: string;
  reporter_position: string;
  reporter_division: string;
  category_id: string;
  category_name: string;
  description: string;
  location?: string;
  attachment_url?: string;
}

export interface FeatureRequestPayload {
  requester_name: string;
  requester_position: string;
  requester_division: string;
  title: string;
  background: string;
  description: string;
  user_priority: 'low' | 'medium' | 'high';
  target_date?: string;
  attachment_url?: string;
}

export interface TicketResult {
  success: boolean;
  ticket_code?: string;
  error?: string;
}

// =========================================================
// Helpers
// =========================================================

/**
 * Generate a unique ticket code.
 * Format: SUP-YYYY-XXXX or REQ-YYYY-XXXX (where XXXX is random alphanumeric)
 */
export function generateTicketCode(type: TicketType): string {
  const prefix = type === 'support' ? 'SUP' : 'REQ';
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${year}-${random}`;
}

// =========================================================
// Submit Functions
// =========================================================

/**
 * Submit a Support Ticket (Modul 2) to Supabase.
 */
export async function submitSupportTicket(payload: SupportTicketPayload): Promise<TicketResult> {
  let ticket_code = generateTicketCode('support');

  // Ensure uniqueness (retry once if collision — extremely rare)
  const { data: existing } = await supabase
    .from('support_tickets')
    .select('ticket_code')
    .eq('ticket_code', ticket_code)
    .maybeSingle();
  if (existing) {
    ticket_code = generateTicketCode('support');
  }

  const { error } = await supabase.from('support_tickets').insert({
    ticket_code,
    reporter_name: payload.reporter_name,
    reporter_position: payload.reporter_position,
    reporter_division: payload.reporter_division,
    category_id: payload.category_id || null,
    category_name: payload.category_name,
    description: payload.description,
    location: payload.location || null,
    attachment_url: payload.attachment_url || null,
    status: 'open',
  });

  if (error) {
    console.error('[submitSupportTicket]', error);
    return { success: false, error: error.message };
  }
  return { success: true, ticket_code };
}

/**
 * Submit a Feature Request (Modul 1) to Supabase.
 */
export async function submitFeatureRequest(payload: FeatureRequestPayload): Promise<TicketResult> {
  let ticket_code = generateTicketCode('request');

  const { data: existing } = await supabase
    .from('feature_requests')
    .select('ticket_code')
    .eq('ticket_code', ticket_code)
    .maybeSingle();
  if (existing) {
    ticket_code = generateTicketCode('request');
  }

  const { error } = await supabase.from('feature_requests').insert({
    ticket_code,
    requester_name: payload.requester_name,
    requester_position: payload.requester_position,
    requester_division: payload.requester_division,
    title: payload.title,
    background: payload.background,
    description: payload.description,
    user_priority: payload.user_priority,
    target_date: payload.target_date || null,
    attachment_url: payload.attachment_url || null,
    status: 'reviewing',
  });

  if (error) {
    console.error('[submitFeatureRequest]', error);
    return { success: false, error: error.message };
  }
  return { success: true, ticket_code };
}

// =========================================================
// Tracking Functions
// =========================================================

/**
 * Get ticket data by ticket_code from either table.
 * Returns a unified ticket object or null if not found.
 */
export async function getTicketByCode(code: string) {
  const upperCode = code.trim().toUpperCase();

  if (!upperCode.startsWith('SUP-') && !upperCode.startsWith('REQ-')) {
    return null;
  }

  const { data, error } = await supabase.rpc('get_public_ticket_by_code', {
    input_code: upperCode,
  });

  if (error || !data) return null;
  return data;
}

/**
 * Confirm a support ticket as closed by the reporter.
 */
export async function confirmTicketClosed(ticket_code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('confirm_ticket_closed_public', {
    input_code: ticket_code,
  });

  if (error) return false;
  return data === true;
}

/**
 * Get active categories for the support form dropdown.
 */
export async function getActiveCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (error) return [];
  return data ?? [];
}

/**
 * Upload an attachment to Supabase Storage and return the public URL.
 */
export async function uploadAttachment(file: File): Promise<string | null> {
  if (!file || file.size === 0) return null;

  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('attachments')
    .upload(`public/${fileName}`, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error('[uploadAttachment]', error);
    return null;
  }

  const { data: publicUrlData } = supabase.storage
    .from('attachments')
    .getPublicUrl(data.path);

  return publicUrlData.publicUrl;
}
