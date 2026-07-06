-- Create a public bucket for ticket attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow public uploads (anyone can upload attachments for their tickets)
CREATE POLICY "Public Upload to attachments" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'attachments');

-- Policy to allow public reading of attachments
CREATE POLICY "Public Read attachments" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'attachments');

-- Policy to allow IT staff (authenticated) to manage attachments
CREATE POLICY "Admin manage attachments"
ON storage.objects FOR ALL
USING (bucket_id = 'attachments' AND auth.role() = 'authenticated');
