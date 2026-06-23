
-- Drop overly permissive policies
DROP POLICY "Authenticated users can create mesh messages" ON public.mesh_messages;
DROP POLICY "Authenticated users can update mesh messages" ON public.mesh_messages;

-- Add user_id column for proper RLS
ALTER TABLE public.mesh_messages ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Tighter insert policy
CREATE POLICY "Users can create mesh messages" ON public.mesh_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Tighter update policy  
CREATE POLICY "Users can update own mesh messages" ON public.mesh_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
