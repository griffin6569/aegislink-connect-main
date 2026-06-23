import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StatusBar } from '@/components/StatusBar';
import { BottomNav } from '@/components/BottomNav';
import { SeverityBadge } from '@/components/SeverityBadge';
import { useAuth } from '@/hooks/useAuth';
import { useSyncEngine } from '@/lib/sync-engine';
import { supabase } from '@/integrations/supabase/client';
import { GeolocationMode, useGeolocation } from '@/hooks/useGeolocation';
import { generateIncidentAssessment } from '@/lib/incident-intelligence';
import {
  IncidentCategory,
  IncidentOrigin,
  SeverityLevel,
  CATEGORY_LABELS,
  INCIDENT_SUBCATEGORIES,
} from '@/lib/types';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Upload,
  MapPin,
  CheckCircle2,
  Shield,
  Flame,
  AlertTriangle,
  Users,
  Eye,
  Brain,
  Loader2,
  Video,
  FileText,
  Mic,
  Image,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';

const categoryIcons: Record<IncidentCategory, typeof Shield> = {
  crime: Shield,
  safety_hazard: AlertTriangle,
  emergency: Flame,
  community_violation: Users,
};

export default function ReportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, hasRole } = useAuth();
  const { queueIncident } = useSyncEngine();
  const { position, loading: geoLoading, error: geoError, requestPosition, confidenceFromAccuracy } = useGeolocation();
  const canSubmitVerifiedSource = hasRole('admin') || hasRole('authority');

  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<IncidentCategory | null>(
    (searchParams.get('category') as IncidentCategory) || null
  );
  const [subcategory, setSubcategory] = useState('');
  const [severity, setSeverity] = useState<SeverityLevel>(
    (searchParams.get('severity') as SeverityLevel) || 'medium'
  );
  const [description, setDescription] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [incidentOrigin, setIncidentOrigin] = useState<IncidentOrigin>('volunteer_upload');
  const [sourcePublisher, setSourcePublisher] = useState('');
  const [sourcePlatform, setSourcePlatform] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [imageAnalysis, setImageAnalysis] = useState<string | null>(null);
  const [analyzingImages, setAnalyzingImages] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [compressing, setCompressing] = useState(false);
  const [locationRequested, setLocationRequested] = useState(false);
  const [locationMode, setLocationMode] = useState<GeolocationMode>('accurate');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastImageAnalysisKeyRef = useRef<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files!);
      setFiles((prev) => [...prev, ...newFiles]);
      // Generate previews for images
      newFiles.forEach((f) => {
        if (f.type.startsWith('image/')) {
          const url = URL.createObjectURL(f);
          setPreviews((prev) => [...prev, url]);
        }
      });
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      toast.error('Camera access denied or unavailable');
    }
  };

  // Attach stream to video element once it's rendered
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  useEffect(() => {
    if (step === 2 && !locationRequested && !position && !geoLoading) {
      setLocationRequested(true);
      requestPosition('accurate').catch(() => {});
    }
  }, [geoLoading, locationRequested, position, requestPosition, step]);

  const stopCamera = () => {
    if (recording) stopRecording();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const compressVideo = async (blob: Blob, mimeType: string): Promise<Blob> => {
    // Re-encode at lower resolution/bitrate using canvas + MediaRecorder
    return new Promise((resolve) => {
      const sourceVideo = document.createElement('video');
      sourceVideo.src = URL.createObjectURL(blob);
      sourceVideo.muted = true;

      sourceVideo.onloadedmetadata = () => {
        // Target: max 720p, preserving aspect ratio
        const scale = Math.min(1, 720 / Math.max(sourceVideo.videoWidth, sourceVideo.videoHeight));
        const w = Math.round(sourceVideo.videoWidth * scale);
        const h = Math.round(sourceVideo.videoHeight * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;

        const compressedStream = canvas.captureStream(24); // 24fps
        const compressedMime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
          ? 'video/webm;codecs=vp8'
          : mimeType;
        const recorder = new MediaRecorder(compressedStream, {
          mimeType: compressedMime,
          videoBitsPerSecond: 800_000, // 800kbps — good quality at small size
        });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
          URL.revokeObjectURL(sourceVideo.src);
          resolve(new Blob(chunks, { type: compressedMime }));
        };

        recorder.start();
        sourceVideo.play();

        const drawFrame = () => {
          if (sourceVideo.ended || sourceVideo.paused) {
            recorder.stop();
            return;
          }
          ctx.drawImage(sourceVideo, 0, 0, w, h);
          requestAnimationFrame(drawFrame);
        };
        requestAnimationFrame(drawFrame);

        sourceVideo.onended = () => recorder.stop();
      };

      // Fallback: if metadata never loads, return original
      sourceVideo.onerror = () => {
        URL.revokeObjectURL(sourceVideo.src);
        resolve(blob);
      };
    });
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4';
    try {
      const recorder = new MediaRecorder(streamRef.current, {
        mimeType,
        videoBitsPerSecond: 1_500_000, // 1.5 Mbps capture
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const rawBlob = new Blob(recordedChunksRef.current, { type: mimeType });
        const rawSize = rawBlob.size;

        // Compress if > 2MB
        let finalBlob = rawBlob;
        if (rawSize > 2 * 1024 * 1024) {
          setCompressing(true);
          toast.info('Compressing video for faster transmission...');
          try {
            finalBlob = await compressVideo(rawBlob, mimeType);
          } catch {
            finalBlob = rawBlob;
          }
          setCompressing(false);
        }

        const ext = finalBlob.type.includes('webm') ? 'webm' : 'mp4';
        const file = new File([finalBlob], `video_${Date.now()}.${ext}`, { type: finalBlob.type });
        setFiles((prev) => [...prev, file]);
        const ratio = rawSize > 0 ? Math.round((1 - finalBlob.size / rawSize) * 100) : 0;
        const sizeStr = (finalBlob.size / 1024 / 1024).toFixed(1);
        toast.success(
          ratio > 5
            ? `Video compressed ${ratio}% → ${sizeStr} MB`
            : `Video saved (${sizeStr} MB)`
        );
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch (err) {
      toast.error('Video recording not supported on this device');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingTime(0);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isExternalSource = incidentOrigin === 'verified_external';

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setFiles((prev) => [...prev, file]);
      setPreviews((prev) => [...prev, URL.createObjectURL(blob)]);
      toast.success('Photo captured');
    }, 'image/jpeg', 0.9);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (previews[index]) {
      URL.revokeObjectURL(previews[index]);
    }
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return Image;
    if (file.type.startsWith('video/')) return Video;
    if (file.type.startsWith('audio/')) return Mic;
    return FileText;
  };

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Failed to read evidence file.'));
          return;
        }

        const [, base64 = ''] = result.split(',');
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read evidence file.'));
      reader.readAsDataURL(file);
    });

  const buildImageEvidencePayload = useCallback(async () => {
    return Promise.all(
      files
        .filter((file) => file.type.startsWith('image/'))
        .slice(0, 3)
        .map(async (file) => ({
          mimeType: file.type,
          data: await fileToBase64(file),
        })),
    );
  }, [files]);

  const getFunctionErrorMessage = useCallback(async (error: unknown) => {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        return body?.error || error.message;
      } catch {
        return error.message;
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Unable to analyze the uploaded image right now.';
  }, []);

  const appendVisualEvidence = useCallback((addendum: string) => {
    const trimmedAddendum = addendum.trim();
    if (!trimmedAddendum || trimmedAddendum === 'No additional visual evidence observed.') {
      return;
    }

    setDescription((current) => {
      const trimmed = current.trim();
      const prefix = 'Visual evidence:';
      const visualEvidenceBlock = `${prefix} ${trimmedAddendum}`;
      if (trimmed.includes(visualEvidenceBlock)) {
        return trimmed;
      }

      const withoutPreviousVisualEvidence = trimmed.replace(/\n\nVisual evidence:[\s\S]*$/i, '').trim();
      return `${withoutPreviousVisualEvidence}\n\n${visualEvidenceBlock}`;
    });
  }, []);

  const analyzeUploadedImages = useCallback(async () => {
    if (!category || !description || !navigator.onLine) {
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setImageAnalysis(null);
      lastImageAnalysisKeyRef.current = '';
      return;
    }

    const analysisKey = imageFiles
      .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
      .join('|');

    if (lastImageAnalysisKeyRef.current === analysisKey) {
      return;
    }

    setAnalyzingImages(true);
    try {
      const imageEvidence = await buildImageEvidencePayload();
      const { data, error } = await supabase.functions.invoke('analyze-incident', {
        body: {
          incident: {
            category,
            subcategory,
            severity,
            description,
            location_address: position
              ? locationMode === 'accurate'
                ? 'Current Location (Accurate)'
                : 'Current Location (Approximate)'
              : 'Location unavailable',
            created_at: new Date().toISOString(),
          },
          analysis_type: 'threat_assessment',
          evidence: imageEvidence,
        },
      });
      if (error) throw error;

      lastImageAnalysisKeyRef.current = analysisKey;
      setImageAnalysis(data.description_addendum || 'No additional visual evidence observed.');
      appendVisualEvidence(data.description_addendum || '');
    } catch (err) {
      console.error('Realtime image analysis failed:', err);
      setImageAnalysis(await getFunctionErrorMessage(err));
    } finally {
      setAnalyzingImages(false);
    }
  }, [
    appendVisualEvidence,
    buildImageEvidencePayload,
    category,
    description,
    files,
    getFunctionErrorMessage,
    locationMode,
    position,
    severity,
    subcategory,
  ]);

  const requestLocation = useCallback((mode: GeolocationMode = locationMode) => {
    setLocationRequested(true);
    requestPosition(mode).catch(() => {});
  }, [locationMode, requestPosition]);

  useEffect(() => {
    if (step !== 2) {
      return;
    }

    const hasImages = files.some((file) => file.type.startsWith('image/'));
    if (!hasImages) {
      setImageAnalysis(null);
      lastImageAnalysisKeyRef.current = '';
      return;
    }

    const timeout = window.setTimeout(() => {
      analyzeUploadedImages().catch(() => {});
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [analyzeUploadedImages, files, step]);

  const handleAIAnalysis = useCallback(async () => {
    if (!category || !description) return;
    setAnalyzingAI(true);
    try {
      const imageEvidence = await buildImageEvidencePayload();

      if (!navigator.onLine) {
        setAiAnalysis(generateIncidentAssessment({
          category,
          subcategory,
          severity,
          description,
          locationMode,
        }));
        return;
      }

      const { data, error } = await supabase.functions.invoke('analyze-incident', {
        body: {
          incident: {
            category,
            subcategory,
            severity,
            description,
            location_address: position
              ? locationMode === 'accurate'
                ? 'Current Location (Accurate)'
                : 'Current Location (Approximate)'
              : 'Location unavailable',
            created_at: new Date().toISOString(),
          },
          analysis_type: 'threat_assessment',
          evidence: imageEvidence,
        },
      });
      if (error) throw error;
      setAiAnalysis(data.analysis);
      if (data.description_addendum) {
        setImageAnalysis(data.description_addendum);
        appendVisualEvidence(data.description_addendum);
      }
      if (data.description_addendum && data.description_addendum !== 'No additional visual evidence observed.') {
        toast.success('Image evidence analyzed and added to the report description');
      }
    } catch (err: any) {
      const message = await getFunctionErrorMessage(err);
      setAiAnalysis(generateIncidentAssessment({
        category,
        subcategory,
        severity,
        description,
        locationMode,
      }));
      setImageAnalysis(message);
      toast.info(`Using on-device incident assessment. ${message}`);
    } finally {
      setAnalyzingAI(false);
    }
  }, [appendVisualEvidence, buildImageEvidencePayload, category, description, getFunctionErrorMessage, locationMode, position, severity, subcategory]);

  const handleSubmit = useCallback(async () => {
    if (!category || !subcategory || !description) return;
    if (isExternalSource && (!sourcePublisher.trim() || !sourceUrl.trim())) {
      toast.error('Publisher and source link are required for verified external incidents.');
      return;
    }
    if (!position) {
      toast.error('Location is required. Keep accurate location enabled or switch to approximate and retry.');
      return;
    }
    setSubmitting(true);

    try {
      const lat = position.lat;
      const lng = position.lng;
      const confidence = confidenceFromAccuracy(position.accuracy);

      const incidentData: any = {
        category,
        subcategory,
        description,
        severity,
        status: severity === 'critical' ? 'acknowledged' : 'pending',
        anonymous,
        detected_lat: lat,
        detected_lng: lng,
        submitted_lat: lat,
        submitted_lng: lng,
        location_confidence: confidence,
        location_address: locationMode === 'accurate' ? 'Current Location (Accurate)' : 'Current Location (Approximate)',
        location_source: locationMode === 'accurate' ? 'gps_accurate' : 'gps_approximate',
        user_id: user?.id || null,
        report_origin: isExternalSource ? 'verified_external' : 'volunteer_upload',
        source_platform: isExternalSource ? sourcePlatform || null : 'volunteer-app',
        source_publisher: isExternalSource ? sourcePublisher.trim() : 'Volunteer Upload',
        source_url: isExternalSource ? sourceUrl.trim() : null,
        source_verification_status: isExternalSource ? 'verified' : 'submitted',
      };

      // Upload evidence files if any
      if (files.length > 0 && user) {
        for (const file of files) {
          const filePath = `${user.id}/${Date.now()}_${file.name}`;
          await supabase.storage.from('evidence').upload(filePath, file);
        }
      }

      // Use sync engine (handles online/offline)
      await queueIncident(incidentData, { locationMode });

      setSubmitted(true);
      toast.success(navigator.onLine ? 'Report submitted!' : 'Report saved offline');
      setTimeout(() => navigate('/'), 2000);
    } catch (err: any) {
      toast.error(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }, [
    anonymous,
    category,
    confidenceFromAccuracy,
    description,
    files,
    incidentOrigin,
    isExternalSource,
    locationMode,
    navigate,
    position,
    queueIncident,
    severity,
    sourcePlatform,
    sourcePublisher,
    sourceUrl,
    subcategory,
    user,
  ]);

  const steps = ['Category', 'Details', 'Evidence', 'Review'];

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center p-8"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-severity-low/20 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-severity-low" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-1">Report Submitted</h2>
          <p className="text-sm text-muted-foreground">
            {navigator.onLine ? 'Sent to authorities' : 'Queued for sync when online'}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background bg-grid">
      <StatusBar />

      <main className="px-4 pt-4 pb-24 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => (step > 0 ? setStep(step - 1) : navigate('/'))} className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Report Incident</h1>
            <p className="text-[10px] font-mono text-muted-foreground">
              STEP {step + 1}/{steps.length} · {steps[step]}
              {!user && ' · Anonymous mode'}
            </p>
          </div>
        </div>

        <div className="flex gap-1 mb-6">
          {steps.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-border'}`} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="cat" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-sm font-semibold text-foreground mb-3">Select Category</h2>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {(Object.keys(CATEGORY_LABELS) as IncidentCategory[]).map((cat) => {
                  const Icon = categoryIcons[cat];
                  return (
                    <button key={cat} onClick={() => { setCategory(cat); setSubcategory(''); }}
                      className={`p-4 rounded-lg border text-left transition-all ${
                        category === cat ? 'bg-primary/10 border-primary/40 glow-primary' : 'bg-card border-border hover:border-primary/20'
                      }`}
                    >
                      <Icon className={`h-5 w-5 mb-2 ${category === cat ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="text-sm font-medium text-foreground block">{CATEGORY_LABELS[cat]}</span>
                    </button>
                  );
                })}
              </div>
              {category && (
                <>
                  <h2 className="text-sm font-semibold text-foreground mb-3">Subcategory</h2>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {INCIDENT_SUBCATEGORIES[category].map((sub) => (
                      <button key={sub} onClick={() => setSubcategory(sub)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          subcategory === sub ? 'bg-primary/10 text-primary border-primary/30' : 'bg-card text-muted-foreground border-border hover:border-primary/20'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button disabled={!category || !subcategory} onClick={() => setStep(1)}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              {canSubmitVerifiedSource && (
                <div className="mb-6 rounded-lg border border-border bg-card p-3">
                  <h2 className="text-sm font-semibold text-foreground mb-3">Source Type</h2>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIncidentOrigin('volunteer_upload')}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        incidentOrigin === 'volunteer_upload'
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground'
                      }`}
                    >
                      <p className="text-xs font-medium">Volunteer Upload</p>
                      <p className="text-[10px] font-mono">Submitted directly by volunteers in the app</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncidentOrigin('verified_external')}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        incidentOrigin === 'verified_external'
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground'
                      }`}
                    >
                      <p className="text-xs font-medium">Verified External</p>
                      <p className="text-[10px] font-mono">Tuko, X/Twitter, Facebook, or other verified publishers</p>
                    </button>
                  </div>
                </div>
              )}

              <h2 className="text-sm font-semibold text-foreground mb-3">Severity Level</h2>
              <div className="flex gap-2 mb-6">
                {(['low', 'medium', 'high', 'critical'] as SeverityLevel[]).map((sev) => (
                  <button key={sev} onClick={() => setSeverity(sev)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-mono font-semibold transition-all ${
                      severity === sev
                        ? `bg-severity-${sev}/15 border-severity-${sev}/40 text-severity-${sev}`
                        : 'bg-card border-border text-muted-foreground'
                    }`}
                  >
                    {sev.toUpperCase()}
                  </button>
                ))}
              </div>

              <h2 className="text-sm font-semibold text-foreground mb-3">Description</h2>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the incident in detail..."
                rows={5}
                className="w-full p-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none mb-4"
              />

              {isExternalSource && (
                <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Publisher</label>
                    <input
                      type="text"
                      value={sourcePublisher}
                      onChange={(e) => setSourcePublisher(e.target.value)}
                      placeholder="Tuko News"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Platform</label>
                    <input
                      type="text"
                      value={sourcePlatform}
                      onChange={(e) => setSourcePlatform(e.target.value)}
                      placeholder="Website, X/Twitter, Facebook"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Source Link</label>
                    <input
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-card border border-border rounded-lg mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Report Anonymously</span>
                </div>
                <button onClick={() => setAnonymous(!anonymous)}
                  className={`w-10 h-6 rounded-full transition-colors ${anonymous ? 'bg-primary' : 'bg-border'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-foreground transition-transform mx-1 ${anonymous ? 'translate-x-4' : ''}`} />
                </button>
              </div>

              {/* AI Analysis Button */}
              {description.length > 20 && (
                <button onClick={handleAIAnalysis} disabled={analyzingAI}
                  className="w-full py-2.5 rounded-lg bg-card border border-primary/30 text-sm text-primary flex items-center justify-center gap-2 mb-4 hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  {analyzingAI ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Brain className="h-4 w-4" /> AI Threat Assessment {files.some((file) => file.type.startsWith('image/')) ? '+ Image Review' : ''}</>
                  )}
                </button>
              )}

              {aiAnalysis && (
                <div className="p-3 bg-card border border-primary/20 rounded-lg mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-3 w-3 text-primary" />
                    <span className="text-[10px] font-mono text-primary uppercase">AI Analysis</span>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{aiAnalysis}</p>
                </div>
              )}

              <button disabled={!description} onClick={() => setStep(2)}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="evidence" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-sm font-semibold text-foreground mb-3">Capture Evidence</h2>
              <p className="text-xs text-muted-foreground mb-4">Use your camera or upload files to document the incident</p>

              {/* Camera / Upload toggle buttons */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={cameraActive ? stopCamera : startCamera}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${
                    cameraActive
                      ? 'bg-severity-critical/10 border-severity-critical/40 text-severity-critical'
                      : 'bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-primary'
                  }`}
                >
                  <Camera className="h-6 w-6" />
                  <span className="text-xs font-medium">{cameraActive ? 'Stop Camera' : 'Live Camera'}</span>
                </button>

                <label className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-primary transition-all cursor-pointer">
                  <Upload className="h-6 w-6" />
                  <span className="text-xs font-medium">Upload Files</span>
                  <input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx" onChange={handleFileChange} className="hidden" />
                </label>
              </div>

              {/* Live camera viewfinder */}
              {cameraActive && (
                <div className="relative mb-4 rounded-lg overflow-hidden border border-primary/30 glow-primary">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg bg-card" />
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Bottom controls: Photo + Record */}
                  <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-6">
                    {/* Capture photo (disabled while recording) */}
                    <button
                      onClick={capturePhoto}
                      disabled={recording}
                      className="w-14 h-14 rounded-full bg-foreground/90 border-4 border-primary flex items-center justify-center hover:scale-105 transition-transform active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Camera className="h-6 w-6 text-primary" />
                    </button>

                    {/* Record / Stop toggle */}
                    <button
                      onClick={recording ? stopRecording : startRecording}
                      className={`w-14 h-14 rounded-full border-4 flex items-center justify-center hover:scale-105 transition-all active:scale-95 ${
                        recording
                          ? 'bg-severity-critical border-severity-critical animate-pulse'
                          : 'bg-foreground/90 border-severity-critical'
                      }`}
                    >
                      {recording ? (
                        <div className="w-5 h-5 rounded-sm bg-foreground" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-severity-critical" />
                      )}
                    </button>
                  </div>

                  {/* Close button */}
                  <div className="absolute top-3 right-3">
                    <button onClick={stopCamera} className="p-1.5 rounded-full bg-card/80 backdrop-blur text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Recording indicator */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 bg-card/80 backdrop-blur rounded-full">
                    <div className={`w-2 h-2 rounded-full ${recording ? 'bg-severity-critical animate-pulse' : 'bg-status-online'}`} />
                    <span className="text-[10px] font-mono text-foreground">
                      {recording ? `REC ${formatTime(recordingTime)}` : 'LIVE'}
                    </span>
                  </div>
                </div>
              )}

              {/* Compression indicator */}
              {compressing && (
                <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg mb-4 animate-pulse">
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Compressing video...</p>
                    <p className="text-[10px] text-muted-foreground font-mono">Reducing size for faster transmission</p>
                  </div>
                </div>
              )}

              {previews.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {previews.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border group">
                      <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeFile(i)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-card/80 backdrop-blur text-severity-critical opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-card/80 backdrop-blur rounded text-[8px] font-mono text-foreground">
                        {(files[i]?.size / 1024).toFixed(0)}KB
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* File list for non-image files */}
              {files.filter((f) => !f.type.startsWith('image/')).length > 0 && (
                <div className="space-y-2 mb-4">
                  {files.map((f, i) => {
                    if (f.type.startsWith('image/')) return null;
                    const FileIcon = getFileIcon(f);
                    return (
                      <div key={i} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
                        <FileIcon className="h-4 w-4 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground truncate">{f.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {f.type.split('/')[1]?.toUpperCase() || 'FILE'} · {(f.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button onClick={() => removeFile(i)} className="p-1 text-muted-foreground hover:text-severity-critical transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Evidence count */}
              {files.length > 0 && (
                <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-lg mb-4">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-foreground">{files.length} evidence file{files.length !== 1 ? 's' : ''} attached</span>
                </div>
              )}

              <div className="p-3 bg-card border border-border rounded-lg mb-4">
                <p className="text-xs font-medium text-foreground mb-1">Location Mode</p>
                <p className="text-[10px] text-muted-foreground font-mono mb-3">
                  Accurate is the default. Switch to approximate if you need a faster, lighter location fix.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['accurate', 'approximate'] as GeolocationMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setLocationMode(mode);
                        requestLocation(mode);
                      }}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        locationMode === mode
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground'
                      }`}
                    >
                      <p className="text-xs font-medium capitalize">{mode}</p>
                      <p className="text-[10px] font-mono">
                        {mode === 'accurate' ? 'High GPS precision' : 'Lower precision, faster fix'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Location section */}
              <div className={`flex items-center gap-3 p-3 bg-card border rounded-lg mb-4 ${
                position ? 'border-status-online/30' : locationRequested && geoError ? 'border-severity-high/30' : 'border-border'
              }`}>
                <MapPin className={`h-4 w-4 ${position ? 'text-status-online' : locationRequested && geoError ? 'text-severity-high' : 'text-muted-foreground'}`} />
                <div className="flex-1">
                  {geoLoading ? (
                    <>
                      <p className="text-xs text-foreground">Detecting location...</p>
                      <p className="text-[10px] text-muted-foreground font-mono">Requesting GPS</p>
                    </>
                  ) : position ? (
                    <>
                      <p className="text-xs text-foreground">Location Detected</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {position.lat.toFixed(5)}, {position.lng.toFixed(5)} · ±{Math.round(position.accuracy)}m · {Math.round(confidenceFromAccuracy(position.accuracy) * 100)}% confidence
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {locationMode === 'accurate' ? 'Accurate location selected' : 'Approximate location selected'}
                      </p>
                    </>
                  ) : !locationRequested ? (
                    <>
                      <p className="text-xs text-foreground">Location required</p>
                      <p className="text-[10px] text-muted-foreground font-mono">Capture accurate or approximate location before continuing</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-foreground">{geoError || 'Location unavailable'}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">Retry this mode or switch to approximate</p>
                    </>
                  )}
                </div>
                {!position && !geoLoading && (
                  <button onClick={() => requestLocation(locationMode)} className="text-[10px] font-mono text-primary">
                    {locationRequested ? 'RETRY' : 'USE LOCATION'}
                  </button>
                )}
              </div>

              {position && (
                <div className="p-3 bg-card border border-border rounded-lg mb-6">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-muted-foreground">ACCURACY</span>
                    <span className="text-[10px] font-mono text-foreground">±{Math.round(position.accuracy)}m</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-status-online rounded-full transition-all"
                      style={{ width: `${confidenceFromAccuracy(position.accuracy) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {(analyzingImages || imageAnalysis) && (
                <div className="mb-6 rounded-lg border border-primary/20 bg-card p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Image Analysis</h3>
                  </div>
                  {analyzingImages ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      Analyzing uploaded image evidence in realtime...
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {imageAnalysis}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={() => { stopCamera(); setStep(3); }}
                disabled={!position}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-sm font-semibold text-foreground mb-4">Review Report</h2>

              <div className="space-y-3 mb-6">
                <div className="p-4 bg-card border border-border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">CATEGORY</span>
                    <span className="text-sm text-foreground">{category && CATEGORY_LABELS[category]} · {subcategory}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">SEVERITY</span>
                    <SeverityBadge severity={severity} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">ANONYMOUS</span>
                    <span className="text-sm text-foreground">{anonymous ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">SOURCE</span>
                    <span className="text-sm text-foreground">
                      {isExternalSource ? `Verified External${sourcePublisher ? ` · ${sourcePublisher}` : ''}` : 'Volunteer Upload'}
                    </span>
                  </div>
                  {isExternalSource && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-muted-foreground">PLATFORM</span>
                        <span className="text-sm text-foreground">{sourcePlatform || 'External'}</span>
                      </div>
                      <div className="border-t border-border pt-3">
                        <span className="text-[10px] font-mono text-muted-foreground block mb-1">SOURCE LINK</span>
                        <p className="text-xs text-foreground break-all">{sourceUrl}</p>
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">EVIDENCE</span>
                    <span className="text-sm text-foreground">{files.length} file(s)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">MODE</span>
                    <span className="text-sm text-foreground">{navigator.onLine ? 'Online' : 'Offline (queued)'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">LOCATION</span>
                    <span className="text-sm text-foreground">{locationMode === 'accurate' ? 'Accurate' : 'Approximate'}</span>
                  </div>
                  <div className="border-t border-border pt-3">
                    <span className="text-[10px] font-mono text-muted-foreground block mb-1">DESCRIPTION</span>
                    <p className="text-xs text-foreground">{description}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || (isExternalSource && (!sourcePublisher.trim() || !sourceUrl.trim()))}
                className={`w-full py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${
                  severity === 'critical'
                    ? 'bg-severity-critical text-foreground glow-critical'
                    : 'bg-primary text-primary-foreground glow-primary'
                }`}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    Submit Report
                  </>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <BottomNav />
    </div>
  );
}
