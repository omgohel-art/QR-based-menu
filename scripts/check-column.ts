import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fgqksskbfvjyobnyncrg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZncWtzc2tipnZ5b2JueW5jcmciLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc1MzYxMTUzMiwiZXhwIjoyMDY5MTg3NTMyfQ.qlbS1P_bSfJkppIwHfSUaJd-5fGpFVxVzFhXk3r1oWU';
const supabase = createClient(supabaseUrl, supabaseKey);

// Check existing columns
const { data, error } = await supabase.from('businessSettings').select('saveInvoiceCustomerInfo').limit(1);
if (error && error.message.includes('saveInvoiceCustomerInfo')) {
  console.log('Column does not exist, need to add it via migration');
  // Can't alter table via Supabase client, need to use SQL
  console.log('Please run: ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "saveInvoiceCustomerInfo" boolean DEFAULT true NOT NULL;');
} else {
  console.log('Column exists or query succeeded:', data);
}
process.exit(0);
