import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '@/redux/authSlice';
import { Clock, ChevronLeft, ChevronRight, CheckCircle, Loader2, Cloud, CloudOff, Send, AlertTriangle, Check, BookOpen, LogOut, ArrowLeft, Star, GraduationCap, Flag } from 'lucide-react';
import ExamDetailModal from '@/components/modals/ExamDetailModal';
import ExamReviewList from '@/components/quiz/ExamReviewList';
import { useGetStudentExamByIdQuery, useSubmitStudentExamMutation } from '@/api/studentExamsApi';
import { useCreateStudentAnswerMutation } from '@/api/studentAnswersApi';
import type { QuizQuestion } from '@/api/studentExamsApi';
import { HeadPoseEstimator } from '@/lib/ExamProctoring';
import type { AttentionState } from '@/lib/ExamProctoring';
import { uploadCheatVideo } from '@/lib/uploadCheatSnapshot';
import { createEpisodeRecorder } from '@/lib/videoBuffer';
import type { EpisodeRecorder } from '@/lib/videoBuffer';
import { useNotificationHub } from '@/contexts/NotificationContext';
import { useReportQuestionMutation } from '@/api/notificationsApi';

// ─── Helpers ───────────────────────────────────────────
const STORAGE_KEY = 'fuec_active_exam';

interface SavedExamState {
  studentExamId: string;
  answers: Record<string, string[]>;
  timeLeftSeconds: number;
  savedAt: number;
  starred: Record<string, boolean>;
}

/* =====================
   Drawing helpers for proctoring preview
===================== */

function draw(
  ctx: CanvasRenderingContext2D,
  state?: AttentionState,
  faces: Array<{ x: number; y: number; width: number; height: number }> = []
) {
  if (!state) return;

  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  for (const f of faces) {
    ctx.strokeRect(f.x, f.y, f.width, f.height);
  }

  if (state.gaze && faces[0]) {
    const face = faces[0];
    const cx = face.x + face.width / 2;
    const cy = face.y + face.height / 2;

    const maxLen = Math.min(face.width, face.height) * 0.8;

    const yawRad = (state.gaze.yaw * Math.PI) / 180;
    const pitchRad = (state.gaze.pitch * Math.PI) / 180;

    const dx = -Math.sin(yawRad) * maxLen;
    const dy = -Math.sin(pitchRad) * maxLen;

    const conf = Math.max(0, Math.min(1, state.gaze.confidence));
    ctx.globalAlpha = 0.25 + 0.75 * conf;
    drawArrow(ctx, cx, cy, dx, dy, '#ffcc00');
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.scale(-1, 1);
  ctx.fillStyle = '#fff';
  ctx.font = '13px monospace';
  ctx.fillText(`Faces: ${state.facesCount}`, -ctx.canvas.width + 10, 20);

  if (state.gaze) {
    ctx.fillText(`Yaw: ${state.gaze.yaw.toFixed(1)}°`, -ctx.canvas.width + 10, 40);
    ctx.fillText(`Pitch: ${state.gaze.pitch.toFixed(1)}°`, -ctx.canvas.width + 10, 60);
    ctx.fillText(`Conf: ${state.gaze.confidence.toFixed(2)}`, -ctx.canvas.width + 10, 80);
  }
  ctx.fillText(`Suspicion: ${(state.suspicionScore * 100).toFixed(0)}%`, -ctx.canvas.width + 10, state.gaze ? 100 : 40);
  ctx.restore();

  if (state.status === 'suspicious') {
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  } else if (state.status && state.status !== 'safe') {
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();

  const angle = Math.atan2(dy, dx);
  const size = 8;

  ctx.beginPath();
  ctx.moveTo(x + dx, y + dy);
  ctx.lineTo(
    x + dx - size * Math.cos(angle - Math.PI / 6),
    y + dy - size * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x + dx - size * Math.cos(angle + Math.PI / 6),
    y + dy - size * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function saveExamState(state: SavedExamState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadExamState(studentExamId: string): SavedExamState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: SavedExamState = JSON.parse(raw);
    if (parsed.studentExamId !== studentExamId) return null;
    const elapsed = Math.floor((Date.now() - parsed.savedAt) / 1000);
    parsed.timeLeftSeconds = Math.max(0, parsed.timeLeftSeconds - elapsed);
    return parsed;
  } catch {
    return null;
  }
}

function clearExamState() {
  localStorage.removeItem(STORAGE_KEY);
}

function parseRemainingTime(remaining: string): number {
  if (!remaining) return 45 * 60;
  if (remaining.includes('T')) {
    // Ensure the timestamp is parsed as UTC by appending 'Z' if missing
    const dateStr = remaining.endsWith('Z') ? remaining : remaining + 'Z';
    const end = new Date(dateStr).getTime();
    return Math.max(0, Math.floor((end - Date.now()) / 1000));
  }
  const parts = remaining.split(':');
  if (parts.length === 3) {
    return (parseInt(parts[0]) || 0) * 3600 + (parseInt(parts[1]) || 0) * 60 + (parseInt(parts[2]) || 0);
  }
  return 45 * 60;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ─── Component ─────────────────────────────────────────
export default function QuizTest() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const studentExamId = searchParams.get('studentExamId') || '';
  const examId = searchParams.get('examId') || '';
  const classSubjectId = searchParams.get('classSubjectId') || '';
  const user = useSelector(selectCurrentUser);

  // ── API Hooks ──

  // ── Security: Block Ctrl, Alt, right-click, F1-F12 (except F11), PrintScreen ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block Ctrl, Alt, F1-F12 (except F11), and PrtSc
      const isFKey = e.key.startsWith("F") && e.key !== "F11" && /^[F][1-9]$|^F1[0-2]$/.test(e.key);
      if (
        e.ctrlKey ||
        e.altKey ||
        isFKey ||
        e.key === "PrintScreen"
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("contextmenu", handleContextMenu, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, []);
  const { data: examData, isLoading: isLoadingExam, error: examError } = useGetStudentExamByIdQuery(studentExamId, {
    skip: !studentExamId,
  });
  const [createAnswer] = useCreateStudentAnswerMutation();
  const [submitExam, { isLoading: isSubmitting }] = useSubmitStudentExamMutation();
  const [reportQuestion] = useReportQuestionMutation();

  // ── State ──
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [examResult, setExamResult] = useState<{ grade: number } | null>(null);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // ── Question Report State ──
  const [reportingQuestionId, setReportingQuestionId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [reportedQuestions, setReportedQuestions] = useState<Record<string, boolean>>({});

  const questions: QuizQuestion[] = useMemo(() => examData?.questions || [], [examData]);

  // --- Proctoring / Head-pose estimator refs & state ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<HeadPoseEstimator | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const episodeRecorderRef = useRef<EpisodeRecorder | null>(null);

  const lastStateRef = useRef<AttentionState | undefined>(undefined);
  const lastFacesRef = useRef<Array<{ x: number; y: number; width: number; height: number }>>([]);
  const displayedGazeRef = useRef<{ yaw: number; pitch: number } | null>(null);
  const displayedFacesRef = useRef<Array<{ x: number; y: number; width: number; height: number }>>([]);

  const [proctoringStarted, setProctoringStarted] = useState(false);
  const [proctorReady, setProctorReady] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const violationCountRef = useRef(0);
  const lastViolationTimeRef = useRef(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const maxViolations = 5;
  const fullscreenRequestedRef = useRef(false);

  // Cheating detection helpers
  const cheatStartRef = useRef<number | null>(null);
  const cheatCapturedRef = useRef(false);
  const [cheatingPaused, setCheatingPaused] = useState(false);
  const [attentionStatus, setAttentionStatus] = useState<AttentionState['status'] | null>(null);
  const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(false);

  // ── Stable refs for values needed inside fire-and-forget capture ──
  const examDataRef = useRef(examData);
  examDataRef.current = examData;
  const userRef = useRef(user);
  userRef.current = user;
  const classSubjectIdRef = useRef(classSubjectId);
  classSubjectIdRef.current = classSubjectId;
  const studentExamIdRef = useRef(studentExamId);
  studentExamIdRef.current = studentExamId;

  const startProctoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // Initialize episode recorder
      const recorder = createEpisodeRecorder(stream);
      console.log('[Proctor] EpisodeRecorder:', recorder ? 'OK' : 'NULL');
      episodeRecorderRef.current = recorder;

      const engine = new HeadPoseEstimator();
      await engine.init();

      engineRef.current = engine;
      setProctorReady(true);
      setProctoringStarted(true);
    } catch (err) {
      console.error('Proctoring start failed', err);
    }
  };

  // Shared punishment function for violations
  const handleViolation = useCallback(async (reason: string) => {
    setAnswers({});
    setStarred({});
    clearExamState();

    try {
      await submitExam(studentExamId).unwrap();
      setShowResults(true);
      toast.error(reason);
    } catch (err) {
      console.error('Auto-submit violation failed', err);
    }
  }, [studentExamId, submitExam]);

  const incrementViolation = useCallback((msg: string) => {
    if (showResults || examDataRef.current?.isSubmitted) return;
    const now = Date.now();
    if (now - lastViolationTimeRef.current < 2000) return;
    lastViolationTimeRef.current = now;

    violationCountRef.current += 1;
    const currentCount = violationCountRef.current;
    setViolationCount(currentCount);

    const combinedMsg = `Violation ${currentCount} / ${maxViolations}: ${msg}`;
    if (currentCount >= maxViolations) {
      handleViolation(`${combinedMsg}. The exam is being auto-submitted.`);
    } else {
      toast.warning(combinedMsg);
    }
  }, [maxViolations, handleViolation]);

  // Auto-start proctoring when exam data is loaded (skip for exempt students or already submitted)
  useEffect(() => {
    if (!examData) return;
    if (examData.isProctoringExempt || examData.isSubmitted || showResults) {
      // Exempt students or finished exams skip camera/AI entirely — mark ready so timer starts or results show
      setProctoringStarted(true);
      setProctorReady(true);
      return;
    }
    if (!proctoringStarted) startProctoring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examData, showResults]);

  // Request fullscreen once proctoring is ready (separate effect)
  useEffect(() => {
    const isLockdownBrowser = navigator.userAgent.includes('FUECLockdownBrowser');
    const isFinished = examData?.isSubmitted || showResults;

    if (!proctorReady || isFinished || isLockdownBrowser) return;
    if (fullscreenRequestedRef.current) return;

    fullscreenRequestedRef.current = true;
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => { });
      }
    } catch { /* ignore */ }
  }, [proctorReady, examData?.isSubmitted, showResults]);

  // Fullscreen enforcement and violation tracking
  useEffect(() => {
    const isLockdownBrowser = navigator.userAgent.includes('FUECLockdownBrowser');
    const isFinished = examData?.isSubmitted || showResults;
    if (!proctorReady || isLockdownBrowser || isFinished) {
      setShowFullscreenPrompt(false);
      return;
    }

    const onFullscreenChange = () => {
      // Don't trigger violations if exam is finished
      if (examData?.isSubmitted || showResults) {
        setShowFullscreenPrompt(false);
        return;
      }

      if (!document.fullscreenElement) {
        setShowFullscreenPrompt(true);
        incrementViolation('Fullscreen exited. Please return to fullscreen mode immediately.');
      } else {
        setShowFullscreenPrompt(false);
      }
    };

    // Initial check
    if (!document.fullscreenElement && !(examData?.isSubmitted || showResults)) {
      setShowFullscreenPrompt(true);
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [proctorReady, incrementViolation, examData?.isSubmitted, showResults]);

  // Tab-change / visibility detection
  useEffect(() => {
    if (!examData) return;

    const handleVisibility = () => {
      if (!examData || examData.isSubmitted || showResults) return;
      if (document.visibilityState === 'hidden') {
        setShowTabWarning(true);
        setTimeout(() => setShowTabWarning(false), 3000);
        incrementViolation('You left the exam tab.');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleVisibility);
    };
  }, [examData, showResults, incrementViolation]);

  // Cleanup proctoring resources (camera stream, recording, etc.)
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current = null;
      }
      if (episodeRecorderRef.current) {
        episodeRecorderRef.current.stop();
        episodeRecorderRef.current = null;
      }
    };
  }, []);

  // Stop camera stream immediately when exam is submitted or result page is shown
  useEffect(() => {
    if (examData?.isSubmitted || showResults) {
      if (streamRef.current) {
        console.log('[Proctor] Stopping camera stream - Exam finished');
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
      }
      if (episodeRecorderRef.current) {
        episodeRecorderRef.current.stop();
        episodeRecorderRef.current = null;
      }
    }
  }, [examData?.isSubmitted, showResults]);

  // ══════════════════════════════════════════════════════
  // Main proctoring loop: draw + inference (skip for exempt students)
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    if (!proctorReady) return;
    if (examData?.isProctoringExempt) return;
    if (examData?.isSubmitted || showResults) return;

    let rafId = 0;
    let inferenceTimer: number | null = null;
    let stopped = false;
    let inFlight = false;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ensureCanvasSize = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) return false;
      if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
      if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
      return true;
    };

    const drawLoop = () => {
      rafId = requestAnimationFrame(drawLoop);
      if (!ensureCanvasSize()) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const a = 0.18;
      const state = lastStateRef.current;
      let faces = lastFacesRef.current;

      if (faces.length) {
        const curFaces = displayedFacesRef.current;
        if (!curFaces.length) displayedFacesRef.current = faces;
        else if (faces[0] && curFaces[0]) {
          const f0 = faces[0];
          const c0 = curFaces[0];
          displayedFacesRef.current = [
            {
              x: c0.x + a * (f0.x - c0.x),
              y: c0.y + a * (f0.y - c0.y),
              width: c0.width + a * (f0.width - c0.width),
              height: c0.height + a * (f0.height - c0.height),
            },
          ];
        }
        faces = displayedFacesRef.current;
      }

      let smoothedState = state;
      if (state?.gaze) {
        const cur = displayedGazeRef.current ?? { yaw: state.gaze.yaw, pitch: state.gaze.pitch };
        displayedGazeRef.current = {
          yaw: cur.yaw + a * (state.gaze.yaw - cur.yaw),
          pitch: cur.pitch + a * (state.gaze.pitch - cur.pitch),
        };
        smoothedState = {
          ...state,
          gaze: {
            ...state.gaze,
            yaw: displayedGazeRef.current.yaw,
            pitch: displayedGazeRef.current.pitch,
          },
        };
      }

      draw(ctx, smoothedState, faces);
    };

    const INFERENCE_FPS = 5;
    const INFERENCE_INTERVAL_MS = Math.round(1000 / INFERENCE_FPS);

    const inferenceLoop = async () => {
      if (stopped) return;
      if (!engineRef.current || video.videoWidth === 0) {
        inferenceTimer = window.setTimeout(inferenceLoop, 250);
        return;
      }
      if (inFlight) {
        inferenceTimer = window.setTimeout(inferenceLoop, INFERENCE_INTERVAL_MS);
        return;
      }

      inFlight = true;
      try {
        const ts = performance.now();
        const result = await engineRef.current.estimate(video, ts);
        lastStateRef.current = result.state;
        lastFacesRef.current = result.faces;

        const st = result.state?.status;
        setAttentionStatus(st ?? null);

        // ── Episode-based cheating detection ──
        const allowedStatuses = ['safe', 'looking-down'];
        const isThreat = st && !allowedStatuses.includes(st);
        const wasRecording = episodeRecorderRef.current?.isRecording ?? false;

        const PAUSE_THRESHOLDS: Record<string, number> = {
          suspicious: 4000,
          'looking-left': 4000,
          'looking-right': 4000,
          'no-face': 2000,
          'multiple-faces': 2000,
        };
        const DEFAULT_PAUSE_THRESHOLD = 4000;


        if (isThreat) {
          // ── Threat detected — ensure we're recording ──
          if (!wasRecording && !cheatingPaused) {
            cheatStartRef.current = performance.now();
            cheatCapturedRef.current = false;
            episodeRecorderRef.current?.start();
          }

          // Pause exam after threshold exceeded for the current status
          if (cheatStartRef.current) {
            const elapsed = performance.now() - cheatStartRef.current;
            const threshold = PAUSE_THRESHOLDS[st] ?? DEFAULT_PAUSE_THRESHOLD;
            if (elapsed >= threshold && !cheatingPaused) {
              setCheatingPaused(true);

              // Confirm cheating only when the pause threshold is reached
              // (this is when "Suspicious Behavior Detected" is shown to the student).
              cheatCapturedRef.current = true;
            }
          }
        } else {
          // ── Safe — stop recording & upload if we have footage ──
          if (wasRecording) {
            const recorder = episodeRecorderRef.current;
            const hadConfirmedCheat = cheatCapturedRef.current;

            if (hadConfirmedCheat) {
              const studentCode = examDataRef.current?.studentCode || userRef.current?.entityId || 'unknown';
              const classSubject = classSubjectIdRef.current || 'unknown';
              const sExamId = studentExamIdRef.current;
              const capturedStatus = lastStateRef.current?.status || 'unknown';


              (async () => {
                try {
                  const clip = await recorder?.stop();
                  if (clip && clip.size > 0) {
                    console.log('[Proctor] Uploading episode clip:', clip.size, 'bytes');
                    await uploadCheatVideo(clip, capturedStatus, studentCode, classSubject, sExamId);
                  } else {
                    console.warn('[Proctor] Episode clip was empty or null');
                  }
                } catch (err) {
                  console.warn('[Proctor] Episode upload failed:', err);
                }
              })();
            } else {
              // Keep this branch for future stricter policies; currently all threat states are captured.
              console.log('[Proctor] Episode not confirmed — discarding clip');
              recorder?.stop();
            }
          }

          // Reset state
          cheatStartRef.current = null;
          cheatCapturedRef.current = false;
          if (cheatingPaused) setCheatingPaused(false);
        }
      } finally {
        inFlight = false;
        inferenceTimer = window.setTimeout(inferenceLoop, INFERENCE_INTERVAL_MS);
      }
    };

    drawLoop();
    inferenceLoop();

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      if (inferenceTimer) window.clearTimeout(inferenceTimer);
    };
  }, [proctorReady, cheatingPaused, examData?.isSubmitted, showResults, examData?.isProctoringExempt]);

  // Send evidence exactly when the UI enters the "Suspicious Behavior Detected" state.
  useEffect(() => {
    if (!cheatingPaused) return;

    const studentCode = examDataRef.current?.studentCode || userRef.current?.entityId || 'unknown';
    const classSubject = classSubjectIdRef.current || 'unknown';
    const sExamId = studentExamIdRef.current;
    const capturedStatus = lastStateRef.current?.status || 'suspicious';
    const recorder = episodeRecorderRef.current;

    (async () => {
      try {
        const clip = await recorder?.stop();
        if (clip && clip.size > 0) {
          console.log('[Proctor] Uploading paused-state clip:', clip.size, 'bytes');
          await uploadCheatVideo(clip, capturedStatus, studentCode, classSubject, sExamId);
        } else {
          console.warn('[Proctor] Paused-state clip was empty or null');
        }
      } catch (err) {
        console.warn('[Proctor] Paused-state upload failed:', err);
      } finally {
        // Prevent duplicate upload on the safe-state branch for the same pause cycle.
        cheatCapturedRef.current = false;
      }
    })();
  }, [cheatingPaused]);

  // Resume exam when attention becomes safe
  useEffect(() => {
    if (attentionStatus === 'safe' && cheatingPaused) {
      cheatStartRef.current = null;
      cheatCapturedRef.current = false;
      setCheatingPaused(false);
    }
  }, [attentionStatus, cheatingPaused]);

  // Cleanup on unmount: stop media tracks & recorder
  useEffect(() => {
    return () => {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      } catch { }
      try {
        episodeRecorderRef.current?.destroy();
      } catch { }
      episodeRecorderRef.current = null;
    };
  }, []);

  // ── Security Guard: Block unauthorized re-entry ──
  useEffect(() => {
    if (!examData || !examId) return;

    const requiresCode = (examData as any).securityMode !== 0;
    const isCompleted = examData.isSubmitted;
    const isLockdownBrowser = navigator.userAgent.includes('FUECLockdownBrowser');
    const appAuth = searchParams.get('appAuth') === 'true';

    // If appAuth is present, automatically set session storage to true
    if (appAuth) {
      sessionStorage.setItem(`quiz_authorized_${examId}`, 'true');
    }

    if (requiresCode && !isCompleted && !isLockdownBrowser && !appAuth && !sessionStorage.getItem(`quiz_authorized_${examId}`)) {
      console.warn('Unauthorized quiz access detected. Redirecting to lobby.');
      navigate(`/student/exam-lobby/${examId}?classSubjectId=${classSubjectId}`);
    }
  }, [examData, examId, navigate, classSubjectId, searchParams]);

  // ── Initialize timer & restore answers ──
  useEffect(() => {
    if (!examData || initialized) return;

    const saved = loadExamState(studentExamId);
    if (saved) {
      setAnswers(saved.answers);
      setStarred(saved.starred);
      setTimeLeft(saved.timeLeftSeconds);
    } else {
      let initialTime = examData.duration ? examData.duration * 60 : 45 * 60;
      if (examData.remainingTime) {
        const remaining = parseRemainingTime(examData.remainingTime);
        if (remaining > 0) initialTime = remaining;
      } else if (examData.endTime) {
        const dateStr = examData.endTime.endsWith('Z') ? examData.endTime : examData.endTime + 'Z';
        initialTime = Math.max(0, Math.floor((new Date(dateStr).getTime() - Date.now()) / 1000));
      }
      setTimeLeft(initialTime);

      const dbAnswers: Record<string, string[]> = {};
      examData.questions.forEach((q) => {
        if (q.choiceIds && q.choiceIds.length > 0) {
          dbAnswers[q.id] = q.choiceIds;
        } else if (q.choiceId) {
          dbAnswers[q.id] = [q.choiceId];
        }
      });
      if (Object.keys(dbAnswers).length > 0) {
        setAnswers(dbAnswers);
      }
    }

    setInitialized(true);
  }, [examData, studentExamId, initialized]);

  // ── Sync Timer if Backend updates (e.g. Teacher extends time) ──
  useEffect(() => {
    if (!initialized || !examData?.remainingTime || showResults) return;

    const serverTimeLeft = parseRemainingTime(examData.remainingTime);
    // Only sync if the difference is more than 5 seconds to avoid jitter/drift issues
    if (timeLeft !== null && Math.abs(serverTimeLeft - timeLeft) > 5) {
      console.log(`[Quiz] Syncing timer: ${timeLeft}s -> ${serverTimeLeft}s`);
      setTimeLeft(serverTimeLeft);
    }
  }, [examData?.remainingTime, initialized, showResults]);

  // ── Force Submit RTK Query Failsafe ──
  useEffect(() => {
    if (examData?.isSubmitted && !showResults) {
      toast.error('The instructor has ended the exam.');
      setExamResult({ grade: examData.grade ?? 0 });
      setShowResults(true);
      clearExamState();
    }
  }, [examData?.isSubmitted, examData?.grade, showResults]);

  // ── Scroll to top when switching to results view ──
  useEffect(() => {
    if (showResults) {
      const scrollContainer = document.querySelector('.overflow-y-auto');
      if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'instant' });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [showResults]);

  // ── Countdown Timer ──
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || showResults || !proctorReady || showFullscreenPrompt) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return null;
        const next = prev - 1;
        if (next <= 0) {
          handleSubmit(true);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, showResults, proctorReady, showFullscreenPrompt]);

  // ── Persist to localStorage every 5 seconds ──
  useEffect(() => {
    if (!studentExamId || timeLeft === null || showResults) return;

    const interval = setInterval(() => {
      saveExamState({
        studentExamId,
        answers,
        starred,
        timeLeftSeconds: timeLeft,
        savedAt: Date.now(),
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [studentExamId, answers, starred, timeLeft, showResults]);

  // ── Save answer to API ──
  const handleAnswer = useCallback(
    async (questionId: string, newOptionIds: string[], questionType: number) => {
      setAnswers((prev) => ({ ...prev, [questionId]: newOptionIds }));
      setSavingStatus('saving');

      try {
        await createAnswer({
          studentExamId,
          questionId,
          choiceIds: newOptionIds, // Always send array since they can select multiple even for single choice
        }).unwrap();
        setSavingStatus('saved');
        setTimeout(() => setSavingStatus('idle'), 2000);
      } catch (err) {
        console.error('Failed to save answer', err);
        setSavingStatus('error');
        setTimeout(() => setSavingStatus('idle'), 3000);
      }
    },
    [studentExamId, createAnswer]
  );

  const toggleStar = useCallback((questionId: string) => {
    setStarred((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  }, []);

  const handleReportSubmit = useCallback(async () => {
    if (!reportingQuestionId || !reportReason) return;
    setIsReporting(true);
    try {
      await reportQuestion({
        questionId: reportingQuestionId,
        reason: reportReason,
        description: reportDescription || undefined,
        examId: examData?.examId,
      }).unwrap();
      setReportedQuestions((prev) => ({ ...prev, [reportingQuestionId]: true }));
      toast.success('Question reported successfully');
    } catch {
      toast.error('Failed to report question');
    } finally {
      setIsReporting(false);
      setReportingQuestionId(null);
      setReportReason('');
      setReportDescription('');
    }
  }, [reportingQuestionId, reportReason, reportDescription, examData?.examId, reportQuestion]);

  const attemptFullscreen = useCallback(() => {
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => { });
        return;
      }
    } catch {
      // ignore
    }

    try {
      const down = new KeyboardEvent('keydown', { key: 'F11', code: 'F11', keyCode: 122, which: 122, bubbles: true, cancelable: true });
      window.dispatchEvent(down);
      const up = new KeyboardEvent('keyup', { key: 'F11', code: 'F11', keyCode: 122, which: 122, bubbles: true, cancelable: true });
      window.dispatchEvent(up);
    } catch {
      // ignore
    }
  }, []);

  // ── Submit Exam ──
  const handleSubmit = useCallback(
    async (autoSubmit = false) => {
      if (!autoSubmit) {
        setShowConfirmSubmit(true);
        return;
      }

      try {
        const result = await submitExam(studentExamId).unwrap();
        setExamResult({ grade: result?.result?.grade ?? result?.grade ?? 0 });
        setShowResults(true);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => { });
        }
        clearExamState();
      } catch (err) {
        console.error('Failed to submit exam', err);
        toast.error('Error submitting exam. Please try again.');
      }
    },
    [studentExamId, submitExam]
  );

  const confirmSubmit = useCallback(async () => {
    setShowConfirmSubmit(false);
    try {
      const result = await submitExam(studentExamId).unwrap();
      setExamResult({ grade: result?.result?.grade ?? result?.grade ?? 0 });
      setShowResults(true);
      clearExamState();
    } catch (err) {
      console.error('Failed to submit exam', err);
      toast.error('Error submitting exam. Please try again.');
    }
  }, [studentExamId, submitExam]);

  // ── Real-time Notification for Force Submit ──
  const { notifications } = useNotificationHub();

  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      // Check if the latest notification is an Exam Force Submit
      // NotificationType.Exam is typically 3 (System=0, Message=1, Assignment=2, Exam=3)
      const isExamType = latest.type === 'Exam' || (latest.type as any) === 3 || (latest.type as any) === '3';
      const isForceSubmitTitle =
        latest.title === 'Exam Force Submitted' ||
        latest.title === 'Bài thi đã bị ép nộp' ||
        latest.title?.toLowerCase().includes('force submit') ||
        latest.title?.toLowerCase().includes('ép nộp');

      if (isExamType && isForceSubmitTitle) {
        if (!showResults && !isSubmitting && !showConfirmSubmit) {
          toast.error(latest.message || 'Your exam has been force submitted by the instructor.');
          handleSubmit(true);
        }
      }
    }
  }, [notifications, showResults, isSubmitting, showConfirmSubmit, handleSubmit]);

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;

  // ── Loading State ──
  if (isLoadingExam) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#F37022] mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading exam...</p>
        </div>
      </div>
    );
  }

  // ── Error State ──
  if (examError || !examData) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center bg-white rounded-xl border border-red-200 p-8 max-w-md">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#0A1B3C] mb-2">Could not load exam</h2>
          <p className="text-gray-600 mb-6">An error occurred while loading exam data. Please try again.</p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 bg-[#F37022] text-white rounded-lg font-semibold hover:bg-[#D96419]"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Results Screen ──
  if (showResults || examData?.isSubmitted) {
    const isPublic = examData?.isPublicGrade ?? true;
    const grade = examResult?.grade ?? examData?.grade;
    const hasGrade = grade !== null && grade !== undefined;
    const passed = hasGrade ? grade >= 5 : false;
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto animate-fadeIn">
        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-[#F37022]/10 flex items-center justify-center flex-shrink-0 animate-bounce-subtle">
              <CheckCircle className="w-8 h-8 text-[#F37022]" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-[#0A1B3C] tracking-tight">
                {examData?.isSubmitted && !showResults ? 'Exam Results' : 'Submitted Successfully!'}
              </h1>
              <p className="text-gray-500 font-medium">{examData?.examDisplayName || 'Quiz'}</p>
            </div>
          </div>

          <div className="p-8 rounded-[2rem] border-2 border-amber-100 bg-amber-50/50 transition-all shadow-lg shadow-amber-900/5 flex flex-col md:flex-row items-center justify-between relative overflow-hidden group">
            <div className="absolute -top-6 -right-6 p-3 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-500">
              <GraduationCap className="w-40 h-40" />
            </div>

            <div className="flex flex-col md:flex-row items-center gap-10 w-full relative z-10">
              <div className="flex flex-col items-center md:items-start">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2 text-amber-600">
                  {isPublic ? 'Final Score' : 'Status'}
                </p>
                <div className="flex items-baseline gap-2">
                  {isPublic && hasGrade ? (
                    <>
                      <span className="text-7xl font-black tracking-tighter leading-none text-amber-700">
                        {grade.toFixed(1)}
                      </span>
                      <span className="text-2xl font-bold text-gray-400">/ 10.0</span>
                    </>
                  ) : (
                    <span className="text-4xl font-black tracking-tight text-amber-700">SUBMITTED</span>
                  )}
                </div>
              </div>

              <div className="hidden md:block h-20 w-px bg-gray-200/60" />

              <div className="flex-1 flex flex-col items-center md:items-start">
                <div className="flex items-center gap-3 text-gray-600 bg-white/40 backdrop-blur-sm p-3 rounded-xl border border-white/60">
                  <div className="w-8 h-8 rounded-lg bg-[#F37022]/10 flex items-center justify-center">
                    {isPublic ? <BookOpen className="w-4 h-4 text-[#F37022]" /> : <CheckCircle className="w-4 h-4 text-[#F37022]" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider leading-none mb-1">
                      {isPublic ? 'Questions' : 'Result'}
                    </p>
                    <p className="text-sm font-bold text-[#0A1B3C]">
                      {isPublic
                        ? `${Object.keys(answers).length || (examData?.questions?.filter((q) => q.choiceId || (q.choiceIds && q.choiceIds.length > 0)).length ?? 0)} / ${questions.length} Questions Answered`
                        : 'Your grade will be public soon.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 justify-center md:justify-end mt-4 md:mt-0">
                <button
                  onClick={() => {
                    const targetId = classSubjectId || examData?.classSubjectId;
                    if (targetId) {
                      navigate(`/student/course-details/${targetId}`);
                    } else {
                      navigate('/student/exams');
                    }
                  }}
                  className="px-8 py-4 bg-[#F37022] text-white rounded-2xl font-bold hover:bg-[#D96419] transition-all flex items-center gap-2 shadow-xl shadow-orange-100 active:scale-95 group/btn"
                >
                  <ArrowLeft className="w-5 h-5 group-hover/btn:-translate-x-1 transition-transform" />
                  <span>Return to Course</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {isPublic && (
          <div className="mt-8">
            <h2 className="text-lg font-bold text-[#0A1B3C] mb-4 px-2 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#F37022]" />
              Exam Details
            </h2>
            <ExamReviewList questions={questions} showAnswers={examData?.showAnswers} />
          </div>
        )}
        <div className="h-28" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-yellow-500 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">No questions found for this exam.</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-[#F37022] font-medium hover:underline">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const scrollToQuestion = (id: string, index: number) => {
    setCurrentQuestion(index);
    const element = document.getElementById(`question-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // ── Quiz UI ──
  return (
    <>
      {/* Fullscreen Prompt Modal (hidden for lockdown browser) */}
      {showFullscreenPrompt && !navigator.userAgent.includes('FUECLockdownBrowser') && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4 p-safe animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-lg font-bold text-[#0A1B3C] mb-3">Please go fullscreen</h3>
            <p className="text-sm text-gray-600 mb-5">For the best exam experience, please switch to fullscreen mode.</p>
            <button
              onClick={() => {
                attemptFullscreen();
              }}
              className="w-full px-4 py-3 bg-[#F37022] text-white rounded-xl font-bold hover:bg-[#D96419] transition-all"
            >
              Go Fullscreen (F11)
            </button>
          </div>
        </div>
      )}

      {/* Confirm Submit Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4 p-safe animate-fadeIn overflow-hidden">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl relative">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
              <h3 className="text-xl font-bold text-[#0A1B3C]">Confirm Submission</h3>
            </div>
            <p className="text-gray-600 mb-2 font-medium">Are you sure you want to submit the exam?</p>
            {unansweredCount > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4">
                <p className="text-red-600 text-sm font-semibold flex items-center gap-2">⚠ {unansweredCount} questions are unanswered!</p>
              </div>
            )}
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 px-5 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={confirmSubmit}
                disabled={isSubmitting}
                className="flex-1 px-5 py-3 bg-[#F37022] text-white rounded-xl font-bold hover:bg-[#D96419] disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-orange-100 flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Question Report Modal */}
      {reportingQuestionId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl relative">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Flag className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-[#0A1B3C]">Report Question</h3>
            </div>
            <p className="text-gray-600 mb-4 text-sm">Select a reason for reporting this question to the instructor:</p>
            <div className="space-y-2 mb-4">
              {['Wrong/Incorrect Answer', 'Unclear Question', 'Missing Options', 'Duplicate Question', 'Other'].map((reason) => (
                <button
                  key={reason}
                  onClick={() => setReportReason(reason)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium ${reportReason === reason
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-100 hover:border-gray-200 text-gray-700'
                    }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Additional details (optional)"
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 mb-4"
              maxLength={500}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setReportingQuestionId(null);
                  setReportReason('');
                  setReportDescription('');
                }}
                className="flex-1 px-5 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleReportSubmit}
                disabled={!reportReason || isReporting}
                className="flex-1 px-5 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-red-100 flex items-center justify-center gap-2"
              >
                {isReporting && <Loader2 className="w-4 h-4 animate-spin" />}
                Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cheating Pause Overlay (hidden for exempt students)
      {cheatingPaused && !examData?.isProctoringExempt && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl border border-red-100">
            <div className="flex items-center justify-center mb-3">
              <AlertTriangle className="w-12 h-12 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-[#0A1B3C]">Suspicious Behavior Detected</h3>
            <p className="text-sm text-gray-600 mt-2">
              The exam has been paused because suspicious behavior was detected for over 3 seconds. Please return to the exam frame.
            </p>
          </div>
        </div>
      )} */}

      {/* Fullscreen Proctoring Initialization Overlay (hidden for exempt students) */}
      {!proctorReady && !examData?.isProctoringExempt && (
        <div className="fixed inset-0 z-[90] bg-white/70 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="bg-white p-10 rounded-[2rem] shadow-2xl flex flex-col items-center text-center max-w-sm border border-orange-100">
            <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center mb-6 shadow-inner ring-4 ring-white">
              <Loader2 className="w-12 h-12 animate-spin text-[#F37022]" />
            </div>
            <h2 className="text-2xl font-black text-[#0A1B3C] mb-3 tracking-tight">Proctoring Setup</h2>
            <p className="text-gray-500 font-medium mb-8 text-sm leading-relaxed">
              Please allow camera access and position your face visibly in the frame. The exam timer is paused.
            </p>
            <div className="flex items-center gap-3 text-xs font-bold text-[#F37022] bg-[#F37022]/10 px-5 py-2.5 rounded-xl uppercase tracking-widest shadow-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-[#F37022] animate-pulse" />
              Connecting Camera...
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gray-50/50 animate-fadeIn">
        {/* ── Main Layout Container ── */}
        <div className="max-w-[1600px] mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* 1. LEFT SIDEBAR: Info, Timer, Navigator */}
            <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-8">
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-[#F37022]/10 flex items-center justify-center">
                    <GraduationCap className="w-6 h-6 text-[#F37022]" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-[#0A1B3C] leading-tight line-clamp-2 uppercase">
                      {examData.examDisplayName || 'Exam'}
                    </h1>
                    <p className="text-[10px] font-semibold text-gray-400 tracking-widest mt-0.5 uppercase">TEST / EXAM</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Time Remaining</p>
                    {timeLeft !== null && (
                      <div className={`text-3xl font-mono font-bold ${timeLeft <= 300 ? 'text-red-500' : 'text-[#F37022]'}`}>
                        {formatTime(timeLeft)}
                      </div>
                    )}
                    <div className="mt-3">
                      <button
                        onClick={() => attemptFullscreen()}
                        className="w-full px-3 py-2 bg-gray-100 text-sm font-bold rounded-lg hover:bg-gray-200 transition"
                      >
                        Go Fullscreen (F11)
                      </button>
                    </div>
                  </div>

                  {/* Navigator */}
                  <div className="pt-6 border-t border-gray-100">
                    <h3 className="text-sm font-bold text-[#0A1B3C] mb-4 flex items-center gap-2">
                      <div className="w-1 h-4 bg-[#F37022] rounded-full" />
                      Question Index
                    </h3>

                    <div className="grid grid-cols-5 gap-2">
                      {questions.map((q, index) => {
                        const isAnswered = answers[q.id] !== undefined && answers[q.id].length > 0;
                        const isStarred = starred[q.id];
                        const isCurrent = currentQuestion === index;
                        return (
                          <button
                            key={q.id}
                            onClick={() => scrollToQuestion(q.id, index)}
                            className={`h-10 rounded-lg font-bold text-xs transition-all relative ${isCurrent
                              ? 'bg-orange-50 text-[#F37022] border-2 border-[#F37022] shadow-md scale-110 z-10'
                              : isStarred
                                ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300 shadow-sm'
                                : isAnswered
                                  ? 'bg-[#F37022] text-white shadow-sm'
                                  : 'bg-white text-gray-400 border border-gray-100 hover:border-gray-300'
                              }`}
                          >
                            {index + 1}
                            {isStarred && (
                              <Star
                                className={`absolute -top-1 -right-1 w-3 h-3 ${isAnswered ? 'text-yellow-600 fill-current' : 'text-yellow-500 fill-current'}`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-6 border-t border-gray-100">
                    <button
                      onClick={() => {
                        const prevIdx = Math.max(0, currentQuestion - 1);
                        scrollToQuestion(questions[prevIdx].id, prevIdx);
                      }}
                      disabled={currentQuestion === 0}
                      className="flex items-center justify-center gap-2 px-4 py-4 bg-gray-100 text-[#0A1B3C] rounded-xl font-bold text-sm hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-5 h-5" /> Previous
                    </button>
                    <button
                      onClick={() => {
                        const nextIdx = Math.min(questions.length - 1, currentQuestion + 1);
                        scrollToQuestion(questions[nextIdx].id, nextIdx);
                      }}
                      disabled={currentQuestion === questions.length - 1}
                      className="flex items-center justify-center gap-2 px-4 py-4 bg-[#F37022] text-white rounded-xl font-bold text-sm hover:bg-[#D96419] transition-all active:scale-95 shadow-lg shadow-orange-100 disabled:opacity-40"
                    >
                      Next <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. CENTER CONTENT: Question Scrolling List */}
            <div className="lg:col-span-7 space-y-8 pb-32">
              {questions.map((q, index) => (
                <div
                  key={q.id}
                  id={`question-${q.id}`}
                  className={`bg-white rounded-2xl border transition-all duration-300 ${currentQuestion === index ? 'border-[#F37022] ring-1 ring-[#F37022]/20 shadow-md scale-[1.01]' : 'border-gray-100 shadow-sm'
                    } p-8`}
                  onClick={() => setCurrentQuestion(index)}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="inline-block px-3 py-1 bg-[#F37022]/10 text-[#F37022] text-xs font-bold rounded-full uppercase tracking-wider">
                          Question {index + 1}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStar(q.id);
                          }}
                          className={`p-1.5 rounded-lg transition-all ${starred[q.id] ? 'bg-yellow-50 text-yellow-500' : 'bg-gray-50 text-gray-300 hover:text-gray-400'}`}
                        >
                          <Star className={`w-4 h-4 ${starred[q.id] ? 'fill-current' : ''}`} />
                        </button>
                      </div>
                      <h3 className="text-xl font-bold text-[#0A1B3C] leading-relaxed">{q.questionContent}</h3>
                    </div>
                    <div className="flex items-center gap-2 mt-1 ml-4 flex-shrink-0">
                      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                        {q.questionType === 1 ? 'Multiple Choice' : 'Single Choice'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!reportedQuestions[q.id]) {
                            setReportingQuestionId(q.id);
                          }
                        }}
                        disabled={reportedQuestions[q.id]}
                        className={`p-1.5 rounded-lg transition-all ${reportedQuestions[q.id] ? 'bg-red-50 text-red-400 cursor-not-allowed' : 'bg-gray-50 text-gray-300 hover:text-red-500 hover:bg-red-50'}`}
                        title={reportedQuestions[q.id] ? 'Already reported' : 'Report this question'}
                      >
                        <Flag className={`w-4 h-4 ${reportedQuestions[q.id] ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {q.options.map((option, oIdx) => {
                      const isSelected = answers[q.id]?.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          onClick={() => {
                            const existing = answers[q.id] || [];
                            let newOptionIds: string[] = [];

                            // User requested that even if q.questionType === 0 (Single Choice), they can select multiple!
                            if (existing.includes(option.id)) {
                              newOptionIds = existing.filter(id => id !== option.id);
                            } else {
                              newOptionIds = [...existing, option.id];
                            }

                            handleAnswer(q.id, newOptionIds, q.questionType);
                          }}
                          className={`group w-full flex items-center gap-4 p-5 text-left rounded-xl border-2 transition-all duration-200 ${isSelected ? 'border-[#F37022] bg-[#F37022]/5' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'border-[#F37022] bg-[#F37022]' : 'border-gray-200 group-hover:border-gray-300'
                              }`}
                          >
                            {isSelected && <div className="w-2.5 h-2.5 rounded-sm bg-white shadow-sm" />}
                          </div>
                          <span className="text-base font-semibold text-[#0A1B3C] flex items-start gap-3">
                            <span className="text-gray-400 font-bold">{String.fromCharCode(65 + oIdx)}.</span>
                            {option.choiceContent}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 3. RIGHT SIDEBAR: Progress & Status */}
            <div className="lg:col-span-2 space-y-6 lg:sticky lg:top-8">
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Submission Status</h3>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-gray-600 uppercase">Overall Progress</span>
                      <span className="text-sm font-bold text-[#F37022]">
                        {answeredCount}/{questions.length}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden border border-gray-50">
                      <div
                        className="h-full bg-[#F37022] transition-all duration-700 ease-out shadow-sm"
                        style={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                    {savingStatus !== 'idle' && (
                      <div
                        className={`flex items-center justify-center gap-2 text-[10px] font-semibold px-3 py-2 rounded-lg border ${savingStatus === 'saving'
                          ? 'bg-yellow-50 text-yellow-600 border-yellow-100'
                          : savingStatus === 'saved'
                            ? 'bg-green-50 text-green-600 border-green-100'
                            : 'bg-red-50 text-red-600 border-red-100'
                          }`}
                      >
                        {savingStatus === 'saving' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : savingStatus === 'saved' ? (
                          <Cloud className="w-3.5 h-3.5" />
                        ) : (
                          <CloudOff className="w-3.5 h-3.5" />
                        )}
                        {savingStatus === 'saving' ? 'Saving...' : savingStatus === 'saved' ? 'Synced' : 'Sync Error'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="w-full h-16 bg-[#F37022] text-white rounded-2xl font-bold text-sm hover:bg-[#D96419] disabled:opacity-50 transition-all active:scale-95 shadow-xl shadow-orange-100 flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                <span>SUBMIT EXAM</span>
              </button>

              {/* AI Proctoring Camera Preview Window (hidden for exempt students) */}
              {!examData?.isProctoringExempt && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                      <span className="text-xs font-bold text-[#0A1B3C] uppercase tracking-wider">AI Proctoring</span>
                    </div>
                    {proctorReady ? (
                      <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full uppercase">Active</span>
                    ) : (
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full uppercase">Starting</span>
                    )}
                  </div>
                  <div className="relative aspect-video bg-black w-full flex items-center justify-center">
                    {!proctorReady && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-white/80">
                        <Loader2 className="w-6 h-6 animate-spin mb-2 text-[#F37022]" />
                        <span className="text-xs font-semibold">Accessing Camera</span>
                      </div>
                    )}
                    <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                  </div>
                  {/* Inline cheating warning under camera */}
                  {cheatingPaused && (
                    <div className="px-3 py-2.5 bg-red-600 flex items-center justify-center gap-2 animate-pulse">
                      <AlertTriangle className="w-4 h-4 text-white shrink-0" />
                      <span className="text-xs font-bold text-white uppercase tracking-wide">Suspicious Behavior Detected</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="h-10" />
      </div>
    </>
  );
}