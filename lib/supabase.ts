import { createBrowserClient } from '@supabase/ssr';

// Supabase 브라우저 클라이언트 싱글톤
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'
);
