import * as ort from 'onnxruntime-web'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

/* =======================
   Types
======================= */

export type HeadPose3D = {
  yaw: number
  pitch: number
  roll: number
  confidence: number
}

export type GazePose = {
  yaw: number
  pitch: number
  confidence: number
}

export type HeadPose = HeadPose3D

export type CheatStatus =
  | 'safe'
  | 'suspicious'
  | 'looking-away'
  | 'looking-left'
  | 'looking-right'
  | 'looking-down'
  | 'looking-up'
  | 'multiple-faces'
  | 'no-face'

export type AttentionState = {
  headPose?: HeadPose3D
  gaze?: GazePose
  facesCount: number
  timestamp: number
  status: CheatStatus
  /** 0 = fully attentive, 1 = cheating threshold reached */
  suspicionScore: number
}

export type DetectionResult = {
  headPose?: HeadPose
  state?: AttentionState
  faces: Array<{ x: number; y: number; width: number; height: number }>
}

/* =======================
   Thresholds
======================= */

const HEAD_STRAIGHT_YAW = 18
const HEAD_STRAIGHT_PITCH = 18
const EYE_DISTANCE_TOO_FAR = 0.035
const SMOOTHING_ALPHA = 0.25

/* ---------- Suspicion scoring (all values in ms) ---------- */

/** How fast the score rises while looking away (score += dt / RISE_MS).            *
 *  At RISE_MS = 2000 the student must look away for 2 s straight to go 0 → 1.      */
const SUSPICION_RISE_MS = 2000

/** How fast the score drops while looking at the screen (score -= dt / DECAY_MS).   *
 *  At DECAY_MS = 2500 the score drops from 1 → 0 in ~2.5 s of attentive behaviour.   */
const SUSPICION_DECAY_MS = 2500

/** Score rises faster for no-face / multiple-faces (multiplied by this factor).     */
const CRITICAL_MULTIPLIER = 1.5

/** Score in [0, SUSPICIOUS_THRESHOLD) → 'safe'.                                     */
const SUSPICIOUS_THRESHOLD = 0.35

/** Score in [SUSPICIOUS_THRESHOLD, CHEATING_THRESHOLD) → 'suspicious' (warning).    */
const CHEATING_THRESHOLD = 1.0

/* =======================
   Utils
======================= */

function modelUrl(relative: string) {
  return new URL(`../assets/models/${relative}`, import.meta.url).href
}

/* =======================
   Estimator
======================= */

type GazeBaseline = {
  yaw: number
  pitch: number
  samples: number
}

export class HeadPoseEstimator {
  private ready = false
  private faceLandmarker?: any
  private sessions: { gaze?: ort.InferenceSession } = {}

  private lastHead?: HeadPose3D
  private lastGaze?: GazePose

  private gazeBaseline?: GazeBaseline
  private readonly CALIBRATION_FRAMES = 30

  private gazeChw?: Float32Array

  /* ---- gaze throttle ---- */
  private gazeFrameCounter = 0
  /** Run the ONNX model once every N frames; use cached result otherwise. */
  private readonly GAZE_THROTTLE = 2

  /* ---- suspicion score ---- */
  private suspicionScore = 0
  private lastTimestamp?: number

  /* ---- canvases (lazy, created in init()) ---- */
  private resizeSrcCanvas?: HTMLCanvasElement
  private resizeDstCanvas?: HTMLCanvasElement
  private resizeSrcCtx?: CanvasRenderingContext2D | null
  private resizeDstCtx?: CanvasRenderingContext2D | null

  private readonly gazeInputSize = 448
  private readonly gazeMean = [0.485, 0.456, 0.406]
  private readonly gazeStd = [0.229, 0.224, 0.225]
  private readonly gazeBins = 90
  private readonly gazeBinWidthDeg = 4
  private readonly gazeAngleOffsetDeg = 180

  /* =======================
     Init
======================= */

  async init() {
    if (this.ready) return

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    )

    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      },
      runningMode: 'VIDEO',
      numFaces: 2,
    })

    ort.env.wasm.wasmPaths =
      'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/'
    ort.env.wasm.numThreads = Math.min(2, navigator.hardwareConcurrency ?? 2)

    this.sessions.gaze = await ort.InferenceSession.create(
      modelUrl('resnet50_gaze.onnx'),
      { executionProviders: ['webgpu', 'wasm'], graphOptimizationLevel: 'all' }
    )
    console.log('Gaze session created:', this.sessions.gaze)

    /* ---- lazy canvas init ---- */
    this.resizeSrcCanvas = document.createElement('canvas')
    this.resizeDstCanvas = document.createElement('canvas')
    this.resizeSrcCtx = this.resizeSrcCanvas.getContext('2d', { willReadFrequently: true })
    this.resizeDstCtx = this.resizeDstCanvas.getContext('2d', { willReadFrequently: true })

    this.ready = true
  }

  isReady() {
    return this.ready
  }

  /* =======================
     Core
======================= */

  async estimate(
    video: HTMLVideoElement,
    timestamp: number
  ): Promise<DetectionResult> {
    if (!this.ready || !this.faceLandmarker)
      throw new Error('Estimator not ready')

    const faces: DetectionResult['faces'] = []
    let headPose: HeadPose | undefined
    let state: AttentionState | undefined

    const dt = this.lastTimestamp != null ? Math.max(0, timestamp - this.lastTimestamp) : 0
    this.lastTimestamp = timestamp

    const results = this.faceLandmarker.detectForVideo(video, timestamp)
    if (!results.faceLandmarks?.length) {
      this.accumulateSuspicion(dt, true)
      const status = this.suspicionStatus('no-face')
      state = { facesCount: 0, timestamp, status, suspicionScore: this.suspicionScore }
      return { faces, state }
    }

    const lm = results.faceLandmarks[0]
    const facesCount = results.faceLandmarks.length

    const eyeDist = this.interEyeDistance(lm)
    if (!eyeDist || eyeDist < EYE_DISTANCE_TOO_FAR) {
      this.decaySuspicion(dt)
      state = { facesCount, timestamp, status: 'safe', suspicionScore: this.suspicionScore }
      return { faces, state }
    }

    /* ---------- FACE BOX ---------- */

    const { minX, minY, maxX, maxY } = this.faceBoundingBox(lm)

    faces.push({
      x: minX * video.videoWidth,
      y: minY * video.videoHeight,
      width: (maxX - minX) * video.videoWidth,
      height: (maxY - minY) * video.videoHeight,
    })

    /* ---------- HEAD POSE ---------- */

    const head3d = this.smoothHead(this.solveHeadPose(lm))
    let gaze: GazePose | undefined

    if (
      head3d &&
      Math.abs(head3d.yaw) < HEAD_STRAIGHT_YAW &&
      Math.abs(head3d.pitch) < HEAD_STRAIGHT_PITCH
    ) {
      gaze = await this.estimateGaze(video, lm)
    }

    /* ---------- STATUS CHECK (suspicion-scored) ---------- */

    let rawLabel: CheatStatus = 'safe'
    if (facesCount === 0) {
      rawLabel = 'no-face'
    } else if (facesCount > 1) {
      rawLabel = 'multiple-faces'
    } else {
      const current = gaze || head3d
      if (current) {
        const yawAbs = Math.abs(current.yaw)
        const pitchAbs = Math.abs(current.pitch)
        const isLookingDown = current.pitch < 0 && pitchAbs > HEAD_STRAIGHT_PITCH
        if (yawAbs > HEAD_STRAIGHT_YAW || pitchAbs > HEAD_STRAIGHT_PITCH) {
          // Skip bottomleft / bottomright — treat as non-threatening like looking-down
          if (isLookingDown) {
            rawLabel = 'looking-down'
          } else if (pitchAbs >= yawAbs) {
            // pitch dominates -> up
            rawLabel = 'looking-up'
          } else {
            // yaw dominates -> left or right
            rawLabel = current.yaw > 0 ? 'looking-left' : 'looking-right'
          }
        }
      }
    }

    /* Accumulate or decay based on whether the student is attentive */
    // Treat 'looking-down' as non-threatening: do not increase suspicion for it.
    const isBad = rawLabel !== 'safe' && rawLabel !== 'looking-down'
    const isCritical = rawLabel === 'no-face' || rawLabel === 'multiple-faces'
    if (isBad) {
      this.accumulateSuspicion(dt, isCritical)
    } else {
      this.decaySuspicion(dt)
    }

    const status = this.suspicionStatus(rawLabel)

    state = {
      headPose: head3d,
      gaze,
      facesCount,
      timestamp,
      status,
      suspicionScore: this.suspicionScore,
    }

    headPose = gaze
      ? { yaw: gaze.yaw, pitch: gaze.pitch, roll: 0, confidence: gaze.confidence }
      : head3d

    return { headPose, faces, state }
  }

  /* =======================
     Head Pose
======================= */

  private solveHeadPose(
    lm: Array<{ x: number; y: number }>
  ): HeadPose3D | undefined {
    const nose = lm[1]
    const le = lm[33]
    const re = lm[263]
    if (!nose || !le || !re) return

    const eyeMidX = (le.x + re.x) / 2
    const eyeMidY = (le.y + re.y) / 2

    return {
      yaw: -Math.atan2(nose.x - eyeMidX, 1) * 57.3,
      pitch: Math.atan2(eyeMidY - nose.y, 1) * 57.3,
      roll: Math.atan2(le.y - re.y, le.x - re.x) * 57.3,
      confidence: 1,
    }
  }

  private smoothHead(p?: HeadPose3D): HeadPose3D | undefined {
    if (!p) return
    if (!this.lastHead) return (this.lastHead = p)
    const a = SMOOTHING_ALPHA
    this.lastHead = {
      yaw: this.lastHead.yaw + a * (p.yaw - this.lastHead.yaw),
      pitch: this.lastHead.pitch + a * (p.pitch - this.lastHead.pitch),
      roll: this.lastHead.roll + a * (p.roll - this.lastHead.roll),
      confidence: 1,
    }
    return this.lastHead
  }

  /* =======================
     Gaze
======================= */

  private async estimateGaze(
    video: HTMLVideoElement,
    lm: Array<{ x: number; y: number }>
  ): Promise<GazePose | undefined> {
    if (!this.sessions.gaze) return

    /* Return cached result on skipped frames to reduce ONNX inference load */
    this.gazeFrameCounter++
    if (this.gazeFrameCounter % this.GAZE_THROTTLE !== 0 && this.lastGaze) {
      return this.lastGaze
    }

    const input = await this.prepareFaceCropTensor(video, lm)
    if (!input) return

    const name = this.sessions.gaze.inputNames[0]
    const out = await this.sessions.gaze.run({ [name]: input })

    const outputs = Object.values(out)
    if (outputs.length < 2) return
    const yaw = outputs[0].data as Float32Array
    const pitch = outputs[1].data as Float32Array

    const decoded = this.decodePitchYaw(pitch, yaw)

    const raw = {
      yaw: decoded.yawDeg,
      pitch: decoded.pitchDeg,
      confidence: decoded.confidence,
    }

    /* ---- CALIBRATION ---- */

    if (!this.gazeBaseline || this.gazeBaseline.samples < this.CALIBRATION_FRAMES) {
      this.updateBaseline(raw)
      this.lastGaze = raw
      return raw
    }

    const rel = {
      yaw: raw.yaw - this.gazeBaseline.yaw,
      pitch: raw.pitch - this.gazeBaseline.pitch,
      confidence: raw.confidence,
    }

    if (!this.lastGaze) return (this.lastGaze = rel)

    const a = SMOOTHING_ALPHA
    this.lastGaze = {
      yaw: this.lastGaze.yaw + a * (rel.yaw - this.lastGaze.yaw),
      pitch: this.lastGaze.pitch + a * (rel.pitch - this.lastGaze.pitch),
      confidence: rel.confidence,
    }

    return this.lastGaze
  }

  private updateBaseline(gaze: GazePose) {
    if (!this.gazeBaseline) {
      this.gazeBaseline = { yaw: 0, pitch: 0, samples: 0 }
    }

    this.gazeBaseline.samples++

    const n = this.gazeBaseline.samples
    this.gazeBaseline.yaw += (gaze.yaw - this.gazeBaseline.yaw) / n
    this.gazeBaseline.pitch += (gaze.pitch - this.gazeBaseline.pitch) / n
  }

  /* =======================
     Utils
======================= */

  private decodePitchYaw(p: Float32Array, y: Float32Array) {
    const softmax = (a: Float32Array) => {
      const m = Math.max(...a)
      const exps = a.map(v => Math.exp(v - m))
      const s = exps.reduce((x, y) => x + y, 0)
      return exps.map(v => v / s)
    }

    const ps = softmax(p)
    const ys = softmax(y)

    let pi = 0,
      yi = 0
    for (let i = 0; i < this.gazeBins; i++) {
      pi += ps[i] * i
      yi += ys[i] * i
    }

    return {
      pitchDeg: pi * this.gazeBinWidthDeg - this.gazeAngleOffsetDeg,
      yawDeg: yi * this.gazeBinWidthDeg - this.gazeAngleOffsetDeg,
      confidence: Math.max(...ps) * Math.max(...ys),
    }
  }

  private interEyeDistance(lm: Array<{ x: number; y: number }>) {
    const dx = lm[33].x - lm[263].x
    const dy = lm[33].y - lm[263].y
    return Math.sqrt(dx * dx + dy * dy)
  }

  private async prepareFaceCropTensor(
    video: HTMLVideoElement,
    lm: Array<{ x: number; y: number }>
  ): Promise<ort.Tensor | null> {
    if (!this.resizeSrcCtx || !this.resizeDstCtx || !this.resizeSrcCanvas || !this.resizeDstCanvas) return null

    const vw = video.videoWidth
    const vh = video.videoHeight
    if (vw === 0 || vh === 0) return null

    const { minX, minY, maxX, maxY } = this.faceCropBox(lm)

    const x = Math.round(minX * vw)
    const y = Math.round(minY * vh)
    const w = Math.round((maxX - minX) * vw)
    const h = Math.round((maxY - minY) * vh)

    if (w < 10 || h < 10) return null

    this.resizeSrcCanvas.width = w
    this.resizeSrcCanvas.height = h
    this.resizeDstCanvas.width = this.gazeInputSize
    this.resizeDstCanvas.height = this.gazeInputSize

    this.resizeSrcCtx.drawImage(video, x, y, w, h, 0, 0, w, h)
    this.resizeDstCtx.drawImage(this.resizeSrcCanvas, 0, 0, w, h, 0, 0, this.gazeInputSize, this.gazeInputSize)

    const img = this.resizeDstCtx.getImageData(0, 0, this.gazeInputSize, this.gazeInputSize)
    const size = this.gazeInputSize * this.gazeInputSize
    if (!this.gazeChw) this.gazeChw = new Float32Array(size * 3)

    for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
      this.gazeChw[p] = (img.data[i] / 255 - this.gazeMean[0]) / this.gazeStd[0]
      this.gazeChw[p + size] =
        (img.data[i + 1] / 255 - this.gazeMean[1]) / this.gazeStd[1]
      this.gazeChw[p + size * 2] =
        (img.data[i + 2] / 255 - this.gazeMean[2]) / this.gazeStd[2]
    }

    return new ort.Tensor('float32', this.gazeChw, [
      1,
      3,
      this.gazeInputSize,
      this.gazeInputSize,
    ])
  }

  /* =======================
     Suspicion helpers
  ======================= */

  /** Increase suspicion (student is not looking at screen). */
  private accumulateSuspicion(dt: number, critical: boolean) {
    const mult = critical ? CRITICAL_MULTIPLIER : 1
    this.suspicionScore = Math.min(
      CHEATING_THRESHOLD,
      this.suspicionScore + (dt / SUSPICION_RISE_MS) * mult
    )
  }

  /** Decrease suspicion (student IS looking at screen). */
  private decaySuspicion(dt: number) {
    this.suspicionScore = Math.max(
      0,
      this.suspicionScore - dt / SUSPICION_DECAY_MS
    )
  }

  /**
   * Map the raw per-frame label to the final status based on the
   * accumulated suspicion score.
   *
   *  score < SUSPICIOUS_THRESHOLD  →  'safe'         (brief glance, stretch, etc.)
   *  score < CHEATING_THRESHOLD    →  'suspicious'   (warning; not flagged yet)
   *  score >= CHEATING_THRESHOLD   →  original label ('looking-away' / 'no-face' / …)
   */
  private suspicionStatus(rawLabel: CheatStatus): CheatStatus {
    if (this.suspicionScore < SUSPICIOUS_THRESHOLD) return 'safe'
    if (this.suspicionScore < CHEATING_THRESHOLD) return 'suspicious'
    return rawLabel
  }

  /* =======================
     Bounding Box Helper
  ======================= */

  private faceBoundingBox(lm: Array<{ x: number; y: number }>) {
    let minX = 1,
      minY = 1,
      maxX = 0,
      maxY = 0

    for (const p of lm) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }

    return { minX, minY, maxX, maxY }
  }

  /**
   * Padded + clamped bounding box for ONNX model input.
   * 25% padding on each side ensures the gaze model gets enough
   * facial context regardless of webcam resolution or FOV.
   */
  private faceCropBox(lm: Array<{ x: number; y: number }>) {
    const { minX, minY, maxX, maxY } = this.faceBoundingBox(lm)

    const w = maxX - minX
    const h = maxY - minY
    const padX = w * 0.25
    const padY = h * 0.25

    return {
      minX: Math.max(0, minX - padX),
      minY: Math.max(0, minY - padY),
      maxX: Math.min(1, maxX + padX),
      maxY: Math.min(1, maxY + padY),
    }
  }

  /* =======================
     Dispose
  ======================= */

  dispose() {
    this.faceLandmarker?.close()
    this.faceLandmarker = undefined

    this.sessions.gaze?.release()
    this.sessions.gaze = undefined

    this.resizeSrcCanvas = undefined
    this.resizeDstCanvas = undefined
    this.resizeSrcCtx = undefined
    this.resizeDstCtx = undefined

    this.gazeChw = undefined
    this.lastHead = undefined
    this.lastGaze = undefined
    this.gazeBaseline = undefined
    this.suspicionScore = 0
    this.lastTimestamp = undefined
    this.gazeFrameCounter = 0

    this.ready = false
  }
}
