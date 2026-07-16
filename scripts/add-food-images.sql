-- Add imageUrl column if not exists (safety migration)
ALTER TABLE "menuItems" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- Create storage bucket for food images
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
  'food-images',
  'food-images',
  true,
  false,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to food-images bucket
DO $$ BEGIN
  CREATE POLICY "Public Read Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'food-images');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public Insert Access"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'food-images');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public Update Access"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'food-images');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public Delete Access"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'food-images');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
