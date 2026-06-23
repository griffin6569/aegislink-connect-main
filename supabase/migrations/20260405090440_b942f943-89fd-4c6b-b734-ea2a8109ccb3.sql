
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'authority');

-- Create severity enum
CREATE TYPE public.severity_level AS ENUM ('low', 'medium', 'high', 'critical');

-- Create incident status enum
CREATE TYPE public.incident_status AS ENUM ('pending', 'acknowledged', 'investigating', 'resolved', 'closed');

-- Create incident category enum
CREATE TYPE public.incident_category AS ENUM ('crime', 'safety_hazard', 'emergency', 'community_violation');

-- Create sync status enum
CREATE TYPE public.sync_status AS ENUM ('pending', 'syncing', 'synced', 'failed');

-- Create relay status enum
CREATE TYPE public.relay_status AS ENUM ('pending', 'relayed', 'delivered');

-- Timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role function (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Assign default 'user' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Incidents table
CREATE TABLE public.incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  display_id TEXT NOT NULL DEFAULT ('INC-' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category incident_category NOT NULL,
  subcategory TEXT NOT NULL,
  description TEXT NOT NULL,
  severity severity_level NOT NULL DEFAULT 'medium',
  status incident_status NOT NULL DEFAULT 'pending',
  anonymous BOOLEAN NOT NULL DEFAULT false,
  detected_lat DOUBLE PRECISION,
  detected_lng DOUBLE PRECISION,
  submitted_lat DOUBLE PRECISION,
  submitted_lng DOUBLE PRECISION,
  verified_lat DOUBLE PRECISION,
  verified_lng DOUBLE PRECISION,
  location_confidence DOUBLE PRECISION DEFAULT 0,
  location_address TEXT,
  location_source TEXT DEFAULT 'gps',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view incidents" ON public.incidents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create incidents" ON public.incidents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own incidents" ON public.incidents FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'authority'));
CREATE POLICY "Admins can delete incidents" ON public.incidents FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_incidents_severity ON public.incidents(severity);
CREATE INDEX idx_incidents_category ON public.incidents(category);
CREATE INDEX idx_incidents_status ON public.incidents(status);
CREATE INDEX idx_incidents_created_at ON public.incidents(created_at DESC);
CREATE INDEX idx_incidents_location ON public.incidents(detected_lat, detected_lng);

CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Evidence table
CREATE TABLE public.evidence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_name TEXT,
  file_size BIGINT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view evidence for visible incidents" ON public.evidence FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can upload evidence" ON public.evidence FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own evidence" ON public.evidence FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Evidence storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', true);
CREATE POLICY "Authenticated users can upload evidence" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence');
CREATE POLICY "Anyone can view evidence files" ON storage.objects FOR SELECT USING (bucket_id = 'evidence');
CREATE POLICY "Users can delete own evidence files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'evidence');

-- Sync queue table
CREATE TABLE public.sync_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  payload JSONB NOT NULL,
  sync_status sync_status NOT NULL DEFAULT 'pending',
  retries INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sync queue" ON public.sync_queue FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_sync_queue_updated_at BEFORE UPDATE ON public.sync_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mesh messages table
CREATE TABLE public.mesh_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  sender_device_id TEXT NOT NULL,
  receiver_device_id TEXT,
  payload JSONB NOT NULL,
  relay_status relay_status NOT NULL DEFAULT 'pending',
  expiry_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  relay_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.mesh_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view mesh messages" ON public.mesh_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create mesh messages" ON public.mesh_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update mesh messages" ON public.mesh_messages FOR UPDATE TO authenticated USING (true);

-- AI analyses table
CREATE TABLE public.ai_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE NOT NULL,
  analysis_type TEXT NOT NULL,
  result JSONB NOT NULL,
  model_used TEXT,
  confidence DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view analyses" ON public.ai_analyses FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can create analyses" ON public.ai_analyses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'authority'));
