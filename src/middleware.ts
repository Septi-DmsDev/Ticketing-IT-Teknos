import { defineMiddleware } from 'astro:middleware';
import { supabase } from './lib/supabase';
import { supabaseAdmin } from './lib/supabase-admin';

const ADMIN_LOGIN_PATH = '/admin/login';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (!pathname.startsWith('/admin')) {
    return next();
  }

  const accessToken = context.cookies.get('sb-access-token')?.value;

  if (pathname === ADMIN_LOGIN_PATH) {
    if (!accessToken) {
      return next();
    }

    const {
      data: { user },
    } = await supabase.auth.getUser(accessToken);

    if (user) {
      return context.redirect('/admin');
    }

    context.cookies.delete('sb-access-token', { path: '/' });
    context.cookies.delete('sb-refresh-token', { path: '/' });
    return next();
  }

  if (!accessToken) {
    return context.redirect(ADMIN_LOGIN_PATH);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser(accessToken);

  if (!user) {
    context.cookies.delete('sb-access-token', { path: '/' });
    context.cookies.delete('sb-refresh-token', { path: '/' });
    return context.redirect(ADMIN_LOGIN_PATH);
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    context.cookies.delete('sb-access-token', { path: '/' });
    context.cookies.delete('sb-refresh-token', { path: '/' });
    return context.redirect(ADMIN_LOGIN_PATH);
  }

  context.locals.user = user;
  context.locals.profile = profile;

  return next();
});
