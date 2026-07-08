import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wqwvmkxstkkyfuzgcikv.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ISbebqr7TgR0HH4K-ZhpYg_c4HiHtgW';

export const supabase = createClient(supabaseUrl, supabaseKey);
