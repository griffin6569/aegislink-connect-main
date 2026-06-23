ALTER TABLE public.incidents
  ADD COLUMN report_origin TEXT NOT NULL DEFAULT 'volunteer_upload',
  ADD COLUMN source_platform TEXT,
  ADD COLUMN source_publisher TEXT,
  ADD COLUMN source_url TEXT,
  ADD COLUMN source_verification_status TEXT NOT NULL DEFAULT 'submitted';

ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_report_origin_check
  CHECK (report_origin IN ('volunteer_upload', 'verified_external'));

ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_source_verification_status_check
  CHECK (source_verification_status IN ('submitted', 'verified'));

UPDATE public.incidents
SET
  report_origin = COALESCE(report_origin, 'volunteer_upload'),
  source_verification_status = COALESCE(source_verification_status, 'submitted');

CREATE INDEX idx_incidents_report_origin ON public.incidents(report_origin);
CREATE INDEX idx_incidents_source_platform ON public.incidents(source_platform);
