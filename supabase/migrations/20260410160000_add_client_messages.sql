CREATE TABLE public.client_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 2000),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT client_messages_distinct_users CHECK (sender_user_id <> recipient_user_id)
);

ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own direct messages"
  ON public.client_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_user_id OR auth.uid() = recipient_user_id);

CREATE POLICY "Users can send direct messages"
  ON public.client_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_user_id);

CREATE POLICY "Recipients can update read state"
  ON public.client_messages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_user_id)
  WITH CHECK (auth.uid() = recipient_user_id);

CREATE INDEX idx_client_messages_sender_created_at
  ON public.client_messages(sender_user_id, created_at DESC);

CREATE INDEX idx_client_messages_recipient_created_at
  ON public.client_messages(recipient_user_id, created_at DESC);

CREATE INDEX idx_client_messages_recipient_read_at
  ON public.client_messages(recipient_user_id, read_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'client_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_messages;
  END IF;
END
$$;
