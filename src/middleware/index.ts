import type { MiddlewareHandler } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { pathname } = context.url;

  // Only protect /admin routes (except /admin/login)
  if (!pathname.startsWith('/admin') || pathname === '/admin/login') {
    return next();
  }

  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Get session from cookie
  const cookieHeader = context.request.headers.get('cookie') || '';
  const accessToken = parseCookie(cookieHeader, 'sb-access-token');
  const refreshToken = parseCookie(cookieHeader, 'sb-refresh-token');

  if (accessToken && refreshToken) {
    const { data: { session } } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (session) {
      // User is authenticated — set user in locals for use in pages
      context.locals.user = session.user;
      
      // Fetch role from profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', session.user.id)
        .single();
        
      context.locals.profile = profile;

      return next();
    }
  }

  // Not authenticated — redirect to login
  return context.redirect('/admin/login');
};

function parseCookie(cookieStr: string, key: string): string | null {
  const match = cookieStr.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
