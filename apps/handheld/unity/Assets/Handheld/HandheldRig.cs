using System;
using System.Collections.Concurrent;
using System.Threading;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;

namespace Handheld
{
    /// <summary>
    /// 폰 포즈를 카메라에 먹이고, 그 카메라가 본 그림을 폰으로 되쏜다.
    /// 카메라는 rigRoot 기준으로 놓인다 — rigRoot 를 옮기면 「폰이 움직이는 공간」이 통째로 옮겨간다.
    /// 조이스틱은 그 rigRoot 를 민다 = 방 크기를 넘어 걸어다닌다. TASK-KAR-230.
    ///
    /// **렌즈는 물리 카메라로 말한다** — 줌 = 초점거리(mm), 초점 = focusDistance(m), 조리개 = f-stop.
    /// 전부 `Camera` 의 표준 필드라 파이프라인을 안 탄다(빌트인·URP·HDRP 전부 같다). 흐림을 실제로
    /// 그리는 건 파이프라인 몫이고, 리그는 「어떤 렌즈인가」만 말한다 — 그래서 URP 를 붙이든 빼든
    /// 이 파일은 안 바뀐다.
    /// </summary>
    [ExecuteAlways]
    [RequireComponent(typeof(Camera))]
    [AddComponentMenu("Handheld/Handheld Rig")]
    public sealed class HandheldRig : MonoBehaviour
    {
        [Header("연결")]
        public HandheldServer server;

        [Tooltip("폰 움직임의 원점. 비우면 이 카메라의 부모, 그것도 없으면 월드 원점.")]
        public Transform rigRoot;

        [Header("움직임")]
        [Tooltip("폰이 1m 움직이면 유니티에서 몇 m 움직일까. 6DoF(WebXR)일 때만 의미 있다.")]
        public float worldScale = 1f;

        [Tooltip("자이로만 들어올 때(3DoF)는 위치가 없다 — 회전만 먹인다.")]
        public bool rotationOnlyWhenNo6Dof = true;

        [Header("보간")]
        [Tooltip("포즈를 그대로 박지 않고 목표를 향해 따라가게 한다 — 망 지터·손떨림이 줄어든다.")]
        public bool smoothing = true;

        [Tooltip("목표까지 남은 거리가 절반이 되는 데 걸리는 시간. 클수록 부드럽고 그만큼 늦다.")]
        [Range(0.005f, 0.25f)] public float smoothingHalfLife = 0.045f;

        [Header("조이스틱")]
        [Tooltip("폰 화면의 스틱으로 rigRoot 를 민다 — 방 크기를 넘어 이동한다.")]
        public bool joystickEnabled = true;
        public float moveSpeed = 1.6f;
        public float turnSpeed = 90f;
        public float riseSpeed = 1.0f;

        [Header("화면 비율")]
        [Tooltip("방송은 16:9 로 나간다 — 폰 화면 비율을 그대로 쓰면 송출 프레임과 달라진다.")]
        public AspectMode aspectMode = AspectMode.Fixed16x9;

        [Tooltip("직접 지정할 때의 가로/세로 (예: 16/9 = 1.7778, 세로 방송 = 0.5625).")]
        public float customAspect = 16f / 9f;

        [Tooltip("비율을 바꿀 때 폰 렌즈의 어느 화각을 지킬까. 세로 유지가 덜 놀랍다.")]
        public FovAxis fovAxis = FovAxis.KeepVertical;

        public enum AspectMode { PhoneNative, Fixed16x9, Fixed9x16, Custom }
        public enum FovAxis { KeepVertical, KeepHorizontal }

        /// <summary>지금 렌더할 가로/세로.</summary>
        public float EffectiveAspect(float phoneAspect)
        {
            switch (aspectMode)
            {
                case AspectMode.Fixed16x9: return 16f / 9f;
                case AspectMode.Fixed9x16: return 9f / 16f;
                case AspectMode.Custom: return Mathf.Clamp(customAspect, 0.2f, 5f);
                default: return phoneAspect;
            }
        }

        // ── 렌즈 ─────────────────────────────────────────────────────────────────
        [Header("렌즈 — 물리 카메라")]
        [Tooltip("끄면 옛 방식(순수 FOV)으로 돈다. 켜면 focalLength·focusDistance·f-stop 이 실제 값이 된다.")]
        public bool physicalCamera = true;

        [Tooltip("센서 가로 (mm). 35mm 풀프레임 = 36 — 「50mm 로 가」가 사진기와 같은 뜻이 된다.")]
        public float sensorWidthMm = 36f;

        [Header("줌 (광학)")]
        [Tooltip("배율 1 = 폰 렌즈 그대로.")]
        public float zoomMin = 0.5f;
        public float zoomMax = 16f;

        [Tooltip("목표 배율까지 가는 반감기. 계단식으로 박으면 화면이 튄다.")]
        [Range(0f, 0.6f)] public float zoomRampHalfLife = 0.12f;

        [Tooltip("망원일수록 손떨림이 배율만큼 커진다 — 그만큼 보간을 늘려 상쇄한다(디지털 OIS). "
               + "0 = 안 함, 1 = 배율에 정비례.")]
        [Range(0f, 1f)] public float zoomStabilize = 1f;

        [Tooltip("아무리 망원이어도 이 이상은 안 늦춘다 — 늦으면 겨냥이 안 된다.")]
        [Range(0.02f, 1.0f)] public float maxStabilizedHalfLife = 0.35f;

        [Tooltip("망원에서 스틱 회전 속도를 배율만큼 줄인다. 안 줄이면 조준 자체가 불가능하다.")]
        public bool zoomSlowsTurn = true;

        [Header("초점")]
        public FocusMode focusMode = FocusMode.AutoCenter;

        [Tooltip("초점 거리 (m). 탭 포커스로 맞추면 이 값이 그 거리로 바뀐다.")]
        public float focusDistance = 3f;

        [Tooltip("조리개 (f-stop). 작을수록 얕고 크게 흐려진다 — 이건 감독이 정하는 룩이다.")]
        [Range(0.7f, 32f)] public float aperture = 2.8f;

        [Tooltip("초점이 옮겨가는 반감기 = 랙 포커스 속도. 0 이면 즉시(기계적으로 불가능한 느낌).")]
        [Range(0f, 1.5f)] public float focusRampHalfLife = 0.25f;

        [Tooltip("초점을 잡을 때 때릴 레이어. 배경만 잡히면 여기서 걸러라.")]
        public LayerMask focusMask = ~0;

        public float focusMin = 0.1f;
        public float focusMax = 200f;

        [Tooltip("Target 모드일 때 따라갈 물건 (아바타 머리 등).")]
        public Transform focusTarget;

        [Tooltip("자동 초점을 초당 몇 번 다시 잴까. 매 틱(700Hz) 레이캐스트는 낭비다.")]
        [Range(1, 60)] public int autoFocusHz = 12;

        public enum FocusMode
        {
            /// <summary>조종석이 정한 거리에 고정.</summary>
            Manual,
            /// <summary>화면 한가운데를 계속 잡는다 (기본).</summary>
            AutoCenter,
            /// <summary>폰에서 탭한 자리를 한 번 잡고 고정 (탭 포커스).</summary>
            Point,
            /// <summary>지정한 Transform 을 계속 잡는다.</summary>
            Target,
        }

        [Header("뷰파인더 스트림")]
        [Tooltip("폰으로 보낼 그림의 세로 해상도. 가로는 송출 비율로 정해진다.")]
        [Range(180, 1440)] public int streamHeight = 720;
        [Range(1, 120)] public int streamFps = 60;
        [Range(20, 95)] public int jpegQuality = 62;
        public bool streamEnabled = true;

        [Header("디버그")]
        public bool showOverlay = true;
        public KeyCode recenterKey = KeyCode.R;

        Camera _cam;
        RenderTexture _rt;
        int _rtW, _rtH;

        bool _hasOrigin;
        Vector3 _originPos;
        Quaternion _originRot = Quaternion.identity;

        PhonePose _pose;                 // 폰이 보낸 최신 포즈 (목표)
        bool _everGotPose;
        Vector3 _shownPos;               // 보간으로 실제 그리는 자리
        Quaternion _shownRot = Quaternion.identity;
        bool _shownValid;

        Vector3 _rigHomePos;
        Quaternion _rigHomeRot = Quaternion.identity;
        bool _homeCaptured;
        bool _recenteredThisTick;

        // 렌즈 상태 — 목표와 「실제로 그리는 값」을 나눈다. 사이는 램프가 잇는다.
        float _zoomTarget = 1f, _zoomShown = 1f;
        float _focusTargetDist = 3f, _focusShownDist = 3f;
        bool _focusHit = true;           // 마지막 초점 시도가 뭔가를 맞췄나 (폰 HUD 로 보낸다)
        double _nextAutoFocus;

        // 인코딩 워커 — 한 장씩만 물린다 (밀리면 그 프레임을 건너뛴다).
        readonly BlockingCollection<EncodeJob> _encodeQueue =
            new BlockingCollection<EncodeJob>(new ConcurrentQueue<EncodeJob>(), 1);
        Thread _encodeThread;
        int _encodeBusy;                 // 0/1, Interlocked
        volatile bool _alive;

        // 통계
        double _nextCapture;
        int _sentFrames, _poseCount, _tickCount, _captureCount;
        volatile int _lastKb;
        double _statWindowStart;
        float _fpsShown, _poseHzShown, _tickHzShown, _captureHzShown;
        double _lastTickTime;

        struct EncodeJob
        {
            public byte[] Rgba;
            public int Width, Height, Quality;
            public bool Flip;
        }

        // ── 렌즈 바깥 손잡이 ─────────────────────────────────────────────────────

        /// <summary>뷰파인더가 그려지는 RenderTexture (RGBA — 리드백·JPEG 이 읽는다).</summary>
        public RenderTexture ViewfinderTexture => _rt;

        RenderTexture _rtcRt;
        bool _rtcWanted;

        /// <summary>
        /// WebRTC 영상 트랙이 실을 텍스처 (BGRA).
        ///
        /// **왜 따로 두나** — 두 소비자가 서로 못 받는 포맷을 요구한다:
        ///   WebRTC 트랙   : `B8G8R8A8_SRGB` 만 (다른 걸 주면 ArgumentException)
        ///   AsyncGPUReadback : 이 플랫폼에서 그 포맷을 못 읽는다 (ReadPixels 미지원)
        /// 하나를 맞추면 다른 하나가 깨진다 — 실제로 번갈아 깨졌다. 그래서 소비자마다
        /// 제 포맷을 준다. 그림은 하나(_rt)에서 오고, 여기로는 Blit 한 벌만 더 한다
        /// (GPU 안에서 끝나므로 리드백처럼 파이프라인을 세우지 않는다).
        /// 캡처 규칙(16:9 고정·해상도 손잡이)은 여전히 한 곳에만 있다.
        /// </summary>
        public RenderTexture WebRtcTexture()
        {
            _rtcWanted = true;
            EnsureRtcTexture();
            return _rtcRt;
        }

        /// <summary>WebRTC 가 끝났다 — 텍스처를 놓는다.</summary>
        public void ReleaseWebRtcTexture()
        {
            _rtcWanted = false;
            if (_rtcRt == null) return;
            _rtcRt.Release();
            if (Application.isPlaying) Destroy(_rtcRt); else DestroyImmediate(_rtcRt);
            _rtcRt = null;
        }

        void EnsureRtcTexture()
        {
            if (!_rtcWanted || _rt == null) return;
            if (_rtcRt != null && _rtcRt.width == _rt.width && _rtcRt.height == _rt.height) return;
            if (_rtcRt != null)
            {
                _rtcRt.Release();
                if (Application.isPlaying) Destroy(_rtcRt); else DestroyImmediate(_rtcRt);
            }
            _rtcRt = new RenderTexture(_rt.width, _rt.height, 0, GraphicsFormat.B8G8R8A8_SRGB)
            {
                name = "HandheldViewfinderBGRA",
                filterMode = FilterMode.Bilinear,
            };
            _rtcRt.Create();
        }

        /// <summary>지금 실제로 그리는 배율 (램프가 끝난 값이 아니라 지금 값).</summary>
        public float Zoom => _zoomShown;

        /// <summary>카메라맨·감독이 요청한 목표 배율.</summary>
        public float ZoomTarget
        {
            get => _zoomTarget;
            set => _zoomTarget = Mathf.Clamp(value, Mathf.Min(zoomMin, zoomMax), Mathf.Max(zoomMin, zoomMax));
        }

        /// <summary>지금 초점이 맞아 있는 거리 (m).</summary>
        public float FocusShown => _focusShownDist;

        /// <summary>마지막 초점 시도가 뭔가를 맞췄나. 허공을 탭하면 false.</summary>
        public bool FocusHit => _focusHit;

        /// <summary>지금 렌즈의 초점거리 (mm). 물리 카메라가 꺼져 있으면 0.</summary>
        public float FocalLengthMm =>
            _cam != null && _cam.usePhysicalProperties ? _cam.focalLength : 0f;

        /// <summary>조종석 창에 띄우는 전송 상태 한 줄.</summary>
        public string StatusLine =>
            _rt == null ? "아직 폰이 안 붙었다"
            : $"{_rtW}×{_rtH} · {_fpsShown:0.0} fps · {_lastKb} KB · 포즈 {_poseHzShown:0} Hz · 틱 {_tickHzShown:0} Hz · 캡처요청 {_captureHzShown:0} Hz";

        /// <summary>진단 창구(/diag)가 읽는 수치 한 벌. 사람 눈이 아니라 기계가 읽는다.</summary>
        public string DiagJson()
        {
            var c = System.Globalization.CultureInfo.InvariantCulture;
            return string.Format(c,
                "\"fps\":{0:F1},\"poseHz\":{1:F1},\"tickHz\":{2:F1},\"captureHz\":{3:F1},"
                + "\"kb\":{4},\"rt\":\"{5}x{6}\",\"zoom\":{7:F2},\"focalMm\":{8:F0},"
                + "\"focus\":{9:F2},\"focusHit\":{10},\"everGotPose\":{11},\"sixDof\":{12},"
                + "\"gripRoll\":{13:F0},\"phoneAspect\":{14:F3},\"camPos\":\"{15:F2},{16:F2},{17:F2}\","
                + "\"camYaw\":{18:F1},\"camRoll\":{19:F1},\"camPitch\":{20:F1}",
                _fpsShown, _poseHzShown, _tickHzShown, _captureHzShown,
                _lastKb, _rtW, _rtH, _zoomShown, FocalLengthMm,
                _focusShownDist, _focusHit ? 1 : 0, _everGotPose ? 1 : 0, _pose.SixDof ? 1 : 0,
                _pose.GripRoll, _pose.Aspect,
                transform.position.x, transform.position.y, transform.position.z,
                transform.eulerAngles.y,
                // 롤을 그대로 적는다 — 「세로 그립인데 그림이 옆으로 눕는다」가
                // 카메라가 안 굴러서인지 화면 쪽 문제인지를 이 값 하나가 가른다.
                Mathf.DeltaAngle(0f, transform.eulerAngles.z),
                Mathf.DeltaAngle(0f, transform.eulerAngles.x));
        }

        /// <summary>조종석 창에 띄우는 렌즈 한 줄.</summary>
        public string LensLine =>
            _cam == null ? "—"
            : $"{_zoomShown:0.0}× · {(FocalLengthMm > 0f ? $"{FocalLengthMm:0}mm" : $"fov {_cam.fieldOfView:0.0}°")}"
              + $" · 초점 {_focusShownDist:0.00}m{(_focusHit ? "" : " (못 잡음)")} · f/{aperture:0.0}";

        void Awake()
        {
            _cam = GetComponent<Camera>();
            if (server == null) server = FindAnyObjectByType<HandheldServer>();
            if (rigRoot == null) rigRoot = transform.parent;
            _focusTargetDist = _focusShownDist = Mathf.Clamp(focusDistance, focusMin, focusMax);
            CaptureHome();
        }

        void OnEnable()
        {
            _alive = true;
            _encodeThread = new Thread(EncodeLoop) { IsBackground = true, Name = "handheld-jpeg" };
            _encodeThread.Start();
            _statWindowStart = Now;
            _lastTickTime = Now;
            CaptureHome();
        }

        void OnDisable()
        {
            _alive = false;
            try { _encodeQueue.CompleteAdding(); } catch { }
            if (_cam != null) _cam.targetTexture = null;
            if (_rt != null) { _rt.Release(); DestroyRt(); }
            ReleaseWebRtcTexture();
        }

        void DestroyRt()
        {
            if (_rt == null) return;
            if (Application.isPlaying) Destroy(_rt); else DestroyImmediate(_rt);
            _rt = null;
        }

        void CaptureHome()
        {
            if (_homeCaptured || rigRoot == null) return;
            _rigHomePos = rigRoot.position;
            _rigHomeRot = rigRoot.rotation;
            _homeCaptured = true;
        }

        static double Now => Application.isPlaying
            ? Time.unscaledTimeAsDouble
            : UnityEngine.Time.realtimeSinceStartupAsDouble;

        void Update()
        {
            if (Application.isPlaying) ManualTick(false);
        }

        /// <summary>
        /// 한 틱. Play 중에는 Update 가, 편집 모드에서는 조종석 창이 부른다.
        /// renderManually = 편집 모드라 카메라가 자동으로 안 그려지는 상황.
        /// </summary>
        public void ManualTick(bool renderManually)
        {
            if (server == null) { server = FindAnyObjectByType<HandheldServer>(); if (server == null) return; }
            if (server.rig != this) server.rig = this;      // 진단 창구가 이 수치를 읽는다
            if (_cam == null) _cam = GetComponent<Camera>();

            double now = Now;
            _tickCount++;
            float dt = (float)Math.Min(now - _lastTickTime, 0.25);   // 에디터가 멈췄다 돌아오면 튀지 않게
            _lastTickTime = now;

            _recenteredThisTick = false;
            if (Application.isPlaying && Input.GetKeyDown(recenterKey)) Recenter();
            if (server.ConsumeRecenterRequest()) Recenter();

            // 폰이 보낸 렌즈 요청 — 줌은 목표만 바꾸고(램프가 잇는다), 탭 포커스는 그 자리를 한 번 잰다.
            if (server.ConsumeZoomRequest(out float z)) ZoomTarget = z;
            if (server.ConsumeFocusPoint(out Vector2 vp)) FocusAtViewport(vp);

            bool gotPose = server.TryGetPose(out var pose);
            if (gotPose)
            {
                _pose = pose;
                _everGotPose = true;
                _poseCount++;
                EnsureRenderTexture(pose);
            }

            // ★ 폰을 기다리지 않고 미리 세운다 (2026-08-21). WebRTC 제안이 첫 포즈보다 먼저
            //   오는데, 그때 RT 가 없으면 영상 트랙을 못 붙인다(재협상은 훨씬 비싸다).
            //   송출 비율은 조종석이 정하므로(기본 16:9) 폰 값을 안 기다려도 된다.
            if (_rt == null) EnsureRenderTexture(_pose);

            if (joystickEnabled) ApplyJoystick(server.Joystick, dt);

            UpdateZoom(dt);
            UpdateFocus(dt, now);

            if (_everGotPose) ApplyPose(_pose, dt);

            // 기록은 포즈가 들어온 틱에만 — 700Hz 틱을 그대로 적으면 파일만 커진다.
            if (gotPose && server.Recording)
            {
                server.Recorder.Shown(_pose.Seq, _shownPos, _shownRot,
                    transform.position, transform.eulerAngles.y, server.Joystick, _recenteredThisTick);
            }

            if (streamEnabled && _rt != null && server.Connected
                && now >= _nextCapture && _encodeBusy == 0)
            {
                _nextCapture = now + 1.0 / Mathf.Max(1, streamFps);
                _captureCount++;
                if (renderManually) _cam.Render();
                RequestFrame();
            }

            // WebRTC 가 쓰고 있으면 그 텍스처로 한 벌 옮긴다 (GPU 복사).
            if (_rtcWanted && _rt != null)
            {
                EnsureRtcTexture();
                if (_rtcRt != null) Graphics.Blit(_rt, _rtcRt);
            }

            double win = now - _statWindowStart;
            if (win >= 1.0)
            {
                _fpsShown = (float)(_sentFrames / win);
                _poseHzShown = (float)(_poseCount / win);
                _tickHzShown = (float)(_tickCount / win);
                _captureHzShown = (float)(_captureCount / win);
                _sentFrames = 0;
                _poseCount = 0;
                _tickCount = 0;
                _captureCount = 0;
                _statWindowStart = now;

                // 폰 HUD 로 되돌려 준다 — 카메라맨이 자기가 어디 서 있고 어떤 렌즈인지 봐야 한다.
                Vector3 p = transform.position;
                server.SendStatus(p, transform.eulerAngles.y, _fpsShown, _lastKb,
                    _tickHzShown, _captureHzShown,
                    _zoomShown, FocalLengthMm, _focusShownDist, _focusHit);
            }
        }

        /// <summary>지금 폰이 있는 자리를 rigRoot 원점으로 삼는다.</summary>
        public void Recenter()
        {
            if (!_everGotPose) return;
            _originPos = _pose.Position;
            _originRot = _pose.Rotation;
            _hasOrigin = true;
            _recenteredThisTick = true;
            _shownValid = false;                 // 보간을 새 기준에서 다시 시작
            ApplyPose(_pose, 0f);
        }

        /// <summary>조이스틱으로 옮겨 다닌 rigRoot 를 처음 자리로 되돌린다.</summary>
        public void ResetRig()
        {
            if (rigRoot == null || !_homeCaptured) return;
            rigRoot.SetPositionAndRotation(_rigHomePos, _rigHomeRot);
        }

        // ── 줌 ───────────────────────────────────────────────────────────────────

        /// <summary>
        /// 목표 배율까지 **로그 공간**에서 따라간다 — 1→2 와 8→16 이 같은 시간이 걸린다.
        /// 선형으로 이으면 망원 구간에서 가속하는 것처럼 보인다(같은 Δ배율이 만드는 화각 변화가 다르다).
        /// </summary>
        void UpdateZoom(float dt)
        {
            float lo = Mathf.Min(zoomMin, zoomMax), hi = Mathf.Max(zoomMin, zoomMax);
            float target = Mathf.Clamp(_zoomTarget, lo, hi);
            _zoomShown = Mathf.Clamp(_zoomShown, lo, hi);

            if (dt <= 0f || zoomRampHalfLife <= 0.001f) { _zoomShown = target; return; }

            float k = 1f - Mathf.Pow(0.5f, dt / zoomRampHalfLife);
            _zoomShown = Mathf.Exp(Mathf.Lerp(Mathf.Log(_zoomShown), Mathf.Log(target), k));
            if (Mathf.Abs(_zoomShown - target) < 0.0005f) _zoomShown = target;
        }

        /// <summary>화각에 배율을 먹인다. **tan 을 나눠야** 진짜 광학 줌이다 (각도를 나누면 틀린다).</summary>
        static float ZoomFov(float fovYDeg, float zoom)
        {
            float half = fovYDeg * 0.5f * Mathf.Deg2Rad;
            float z = Mathf.Max(0.0001f, zoom);
            return Mathf.Clamp(2f * Mathf.Atan(Mathf.Tan(half) / z) * Mathf.Rad2Deg, 0.1f, 170f);
        }

        // ── 초점 ─────────────────────────────────────────────────────────────────

        /// <summary>폰이 탭한 자리(뷰포트 0..1, 아래가 0)에 초점을 맞춘다.</summary>
        public void FocusAtViewport(Vector2 viewport)
        {
            if (TryFocusRaycast(viewport, out float d))
            {
                focusDistance = d;
                _focusTargetDist = d;
                _focusHit = true;
                // 탭했다는 건 「여기에 두라」는 뜻이다 — 자동이 곧바로 되돌리면 안 된다.
                if (focusMode == FocusMode.AutoCenter) focusMode = FocusMode.Point;
            }
            else
            {
                // 허공을 탭했다. 초점은 안 건드리고 「못 잡았다」만 알린다.
                _focusHit = false;
            }
        }

        void UpdateFocus(float dt, double now)
        {
            switch (focusMode)
            {
                case FocusMode.Manual:
                    _focusTargetDist = focusDistance;
                    _focusHit = true;
                    break;

                case FocusMode.AutoCenter:
                    if (now >= _nextAutoFocus)
                    {
                        _nextAutoFocus = now + 1.0 / Mathf.Max(1, autoFocusHz);
                        if (TryFocusRaycast(new Vector2(0.5f, 0.5f), out float d))
                        {
                            _focusTargetDist = d;
                            focusDistance = d;
                            _focusHit = true;
                        }
                        else _focusHit = false;   // 하늘을 보고 있다 — 마지막 거리를 지킨다
                    }
                    break;

                case FocusMode.Point:
                    _focusTargetDist = focusDistance;
                    break;

                case FocusMode.Target:
                    if (focusTarget != null)
                    {
                        // 초점면까지의 거리 = 광축에 **투영한** 거리다. 직선 거리를 쓰면
                        // 피사체가 화면 가장자리로 갈수록 초점이 뒤로 밀린다.
                        float proj = Vector3.Dot(focusTarget.position - transform.position, transform.forward);
                        if (proj > 0f) { _focusTargetDist = proj; focusDistance = proj; _focusHit = true; }
                        else _focusHit = false;   // 등 뒤에 있다
                    }
                    else _focusHit = false;
                    break;
            }

            float target = Mathf.Clamp(_focusTargetDist, focusMin, focusMax);
            _focusShownDist = Mathf.Clamp(_focusShownDist, focusMin, focusMax);

            if (dt <= 0f || focusRampHalfLife <= 0.001f) { _focusShownDist = target; return; }

            // **디옵터(1/거리) 공간에서 잇는다** — 실제 포커스 링이 그렇게 돈다. 거리로 이으면
            // 가까운 쪽에서 순간이동하고 먼 쪽에서 한없이 기어간다.
            float k = 1f - Mathf.Pow(0.5f, dt / focusRampHalfLife);
            float d0 = 1f / Mathf.Max(1e-4f, _focusShownDist);
            float d1 = 1f / Mathf.Max(1e-4f, target);
            _focusShownDist = 1f / Mathf.Max(1e-4f, Mathf.Lerp(d0, d1, k));
        }

        bool TryFocusRaycast(Vector2 viewport, out float dist)
        {
            dist = 0f;
            if (_cam == null) return false;

            Ray ray = _cam.ViewportPointToRay(new Vector3(viewport.x, viewport.y, 0f));
            if (!Physics.Raycast(ray, out RaycastHit hit, focusMax, focusMask, QueryTriggerInteraction.Ignore))
                return false;

            dist = Vector3.Dot(hit.point - transform.position, transform.forward);
            if (dist <= 0f) return false;
            dist = Mathf.Clamp(dist, focusMin, focusMax);
            return true;
        }

        // ── 조이스틱 ─────────────────────────────────────────────────────────────
        void ApplyJoystick(Vector4 stick, float dt)
        {
            if (rigRoot == null || dt <= 0f) return;
            if (stick.sqrMagnitude < 1e-6f) return;

            // 왼쪽 스틱 = 수평 이동. 「앞」은 지금 카메라가 보는 쪽 (지면에 눕힌 방향).
            Vector3 fwd = Vector3.ProjectOnPlane(transform.forward, Vector3.up);
            if (fwd.sqrMagnitude < 1e-6f) fwd = Vector3.ProjectOnPlane(transform.up, Vector3.up);
            fwd.Normalize();
            Vector3 right = Vector3.Cross(Vector3.up, fwd);

            rigRoot.position += (fwd * stick.y + right * stick.x) * moveSpeed * dt;

            // 오른쪽 스틱 x = 제자리 회전. 카메라가 선 자리를 축으로 돌아야 「내가 도는」 느낌이 난다.
            //
            // **망원에서는 같은 각속도가 화면에서 배율만큼 빨라진다** — 10배 줌에 90°/s 면
            // 피사체가 눈 깜짝할 사이 화면 밖으로 나간다. 그래서 배율로 나눈다.
            if (Mathf.Abs(stick.z) > 1e-4f)
            {
                float turn = turnSpeed;
                if (zoomSlowsTurn) turn /= Mathf.Max(1f, _zoomShown);
                rigRoot.RotateAround(transform.position, Vector3.up, stick.z * turn * dt);
            }

            // 오른쪽 스틱 y = 승강 (크레인)
            if (Mathf.Abs(stick.w) > 1e-4f)
                rigRoot.position += Vector3.up * (stick.w * riseSpeed * dt);
        }

        // ── 포즈 → 카메라 ────────────────────────────────────────────────────────
        void ApplyPose(PhonePose pose, float dt)
        {
            Quaternion rot = pose.Rotation;
            Vector3 pos = pose.Position;

            // 세로 그립 — 카메라맨이 폰을 세워 잡았다. 카메라를 그만큼 굴려야 16:9 프레임의
            // 수평이 세상의 수평과 맞는다. 폰 화면도 같이 돌아가므로 겨냥 방향과 그림은
            // 어긋나지 않는다 (화면만 돌리면 거짓 뷰파인더가 된다).
            if (Mathf.Abs(pose.GripRoll) > 0.01f)
                rot = rot * Quaternion.AngleAxis(pose.GripRoll, Vector3.forward);

            if (_hasOrigin)
            {
                // 원점 회전은 요(yaw)만 뺀다 — 고개 기울인 채 리센터해도 수평이 안 무너진다.
                Quaternion yawInv = Quaternion.Euler(0f, -_originRot.eulerAngles.y, 0f);
                rot = yawInv * rot;
                pos = yawInv * (pos - _originPos);
            }

            bool usePosition = pose.SixDof || !rotationOnlyWhenNo6Dof;
            Vector3 targetPos = usePosition ? pos * worldScale : Vector3.zero;

            // 보간 — 프레임률과 무관하게 같은 느낌이 나도록 반감기로 계수를 만든다.
            // t 초 뒤 남는 비율 = 0.5^(t / halfLife). dt 가 튀어도 결과가 안 튄다.
            if (smoothing && _shownValid && dt > 0f)
            {
                float k = 1f - Mathf.Pow(0.5f, dt / EffectiveHalfLife());
                _shownPos = Vector3.Lerp(_shownPos, targetPos, k);
                _shownRot = Quaternion.Slerp(_shownRot, rot, k);
            }
            else
            {
                _shownPos = targetPos;
                _shownRot = rot;
                _shownValid = true;
            }

            if (rigRoot != null)
                transform.SetPositionAndRotation(rigRoot.TransformPoint(_shownPos), rigRoot.rotation * _shownRot);
            else
                transform.SetPositionAndRotation(_shownPos, _shownRot);

            if (pose.FovY > 0f) ApplyLens(MapFov(pose.FovY, pose.Aspect), EffectiveAspect(pose.Aspect));
        }

        /// <summary>
        /// 지금 배율에서 써야 할 보간 반감기.
        ///
        /// 각도 오차 1° 는 화면에서 **배율만큼** 커진다 — 1배에서 안 보이던 손떨림이 10배에서는
        /// 화면을 흔든다. 그래서 반감기를 배율에 비례시켜 「화면에서 보이는 떨림」을 일정하게
        /// 유지한다 (렌즈 손떨림 보정이 망원에서 더 세게 도는 것과 같은 이유).
        /// 다만 무한정 늘리면 겨냥이 안 되므로 천장을 둔다.
        /// </summary>
        float EffectiveHalfLife()
        {
            float hl = smoothingHalfLife;
            if (zoomStabilize > 0f)
                hl = smoothingHalfLife * Mathf.Lerp(1f, Mathf.Max(0.25f, _zoomShown), zoomStabilize);
            return Mathf.Clamp(hl, 0.005f, Mathf.Max(smoothingHalfLife, maxStabilizedHalfLife));
        }

        /// <summary>
        /// 폰이 알려준 화각을 렌더 비율에 맞춰 옮긴다.
        /// WebXR 은 폰 화면 비율 기준의 **세로** 화각을 준다 — 비율을 바꾸면 그대로 쓸지
        /// (세로 유지) 가로 화각을 지킬지(가로 유지) 정해야 한다.
        /// </summary>
        float MapFov(float phoneFovY, float phoneAspect)
        {
            float target = EffectiveAspect(phoneAspect);
            if (fovAxis == FovAxis.KeepVertical || Mathf.Approximately(target, phoneAspect))
                return Mathf.Clamp(phoneFovY, 1f, 170f);

            // 가로 화각을 지킨다: 폰의 가로 화각을 구해 목표 비율의 세로 화각으로 되돌린다.
            float halfV = phoneFovY * 0.5f * Mathf.Deg2Rad;
            float halfH = Mathf.Atan(Mathf.Tan(halfV) * phoneAspect);
            float newHalfV = Mathf.Atan(Mathf.Tan(halfH) / Mathf.Max(0.01f, target));
            return Mathf.Clamp(newHalfV * 2f * Mathf.Rad2Deg, 1f, 170f);
        }

        /// <summary>
        /// 화각·초점·조리개를 카메라에 박는다.
        ///
        /// 물리 모드에서는 `fieldOfView` 를 넣으면 유니티가 센서 크기로부터 `focalLength`(mm)를
        /// 되계산한다 — mm 를 우리가 따로 안 구해도 맞는 값이 나온다. 센서 비율을 렌더 비율과
        /// **똑같이** 맞춰 두면 게이트 핏이 무엇이든 결과가 같아 놀랄 일이 없다.
        /// </summary>
        void ApplyLens(float baseFovY, float renderAspect)
        {
            float fovY = ZoomFov(baseFovY, _zoomShown);

            if (!physicalCamera)
            {
                if (_cam.usePhysicalProperties) _cam.usePhysicalProperties = false;
                _cam.fieldOfView = fovY;
                return;
            }

            _cam.usePhysicalProperties = true;
            _cam.gateFit = Camera.GateFitMode.None;

            float w = Mathf.Max(1f, sensorWidthMm);
            var sensor = new Vector2(w, w / Mathf.Max(0.01f, renderAspect));
            if ((_cam.sensorSize - sensor).sqrMagnitude > 1e-6f) _cam.sensorSize = sensor;

            _cam.fieldOfView = fovY;                     // → focalLength 가 따라 잡힌다
            _cam.focusDistance = _focusShownDist;
            _cam.aperture = Mathf.Clamp(aperture, 0.7f, 32f);
        }

        void EnsureRenderTexture(PhonePose pose)
        {
            // 아직 폰이 비율을 안 알려줬으면 16:9 로 친다 — 고정 모드에서는 어차피 안 쓰이고,
            // 폰 비율 모드라도 첫 포즈가 오면 그때 다시 만든다(크기가 바뀌면 새로 만든다).
            float phoneAspect = pose.Aspect > 0.01f ? pose.Aspect : 16f / 9f;
            int h = Mathf.Clamp(streamHeight, 180, 1440);
            int w = Mathf.Max(2, Mathf.RoundToInt(h * EffectiveAspect(phoneAspect)));
            w -= w & 1;                               // 짝수로

            if (_rt != null && _rtW == w && _rtH == h) return;

            _cam.targetTexture = null;
            if (_rt != null) { _rt.Release(); DestroyRt(); }

            // 뷰파인더 RT 는 **리드백이 읽을 수 있는 포맷**이어야 한다.
            // BGRA 로 바꿔 봤더니 이번엔 리드백이 거부했다:
            //   "'B8G8R8A8_SRGB' doesn't support ReadPixels usage on this platform"
            // WebRTC 는 BGRA 만 받으므로 **한 텍스처로 둘을 맞출 수 없다** —
            // 그쪽은 아래 `WebRtcTexture` 가 Blit 로 따로 만들어 준다.
            _rt = new RenderTexture(w, h, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB)
            {
                name = "HandheldViewfinder",
                antiAliasing = 1,
                filterMode = FilterMode.Bilinear,
            };
            _rt.Create();
            _rtW = w; _rtH = h;

            _cam.targetTexture = _rt;
            _cam.aspect = (float)w / h;
        }

        void RequestFrame()
        {
            Interlocked.Exchange(ref _encodeBusy, 1);
            AsyncGPUReadback.Request(_rt, 0, TextureFormat.RGBA32, OnReadback);
        }

        void OnReadback(AsyncGPUReadbackRequest req)
        {
            if (!_alive || req.hasError) { Interlocked.Exchange(ref _encodeBusy, 0); return; }

            var data = req.GetData<byte>();
            var rgba = new byte[data.Length];
            data.CopyTo(rgba);                        // 네이티브 버퍼는 곧 회수된다

            var job = new EncodeJob
            {
                Rgba = rgba, Width = _rtW, Height = _rtH, Quality = jpegQuality,
                Flip = !SystemInfo.graphicsUVStartsAtTop,
            };
            bool queued = false;
            try { queued = _encodeQueue.TryAdd(job); } catch (Exception) { }
            if (!queued) Interlocked.Exchange(ref _encodeBusy, 0);
        }

        void EncodeLoop()
        {
            try
            {
                foreach (var job in _encodeQueue.GetConsumingEnumerable())
                {
                    try
                    {
                        // 리드백 줄 순서는 그래픽스 API 마다 다르다.
                        // D3D(UV 원점 위) = 이미 top-down → 뒤집으면 물구나무선다.
                        // OpenGL/Metal 계열(원점 아래) = bottom-up → 뒤집어야 한다.
                        if (job.Flip) FlipVertical(job.Rgba, job.Width, job.Height);

                        byte[] jpeg = ImageConversion.EncodeArrayToJPG(
                            job.Rgba, GraphicsFormat.R8G8B8A8_SRGB,
                            (uint)job.Width, (uint)job.Height, 0, job.Quality);

                        if (jpeg != null && jpeg.Length > 0)
                        {
                            server?.SendViewfinder(jpeg);
                            _lastKb = jpeg.Length / 1024;
                            Interlocked.Increment(ref _sentFrames);
                        }
                    }
                    catch (Exception e) { Debug.LogWarning("[Handheld] JPEG 실패: " + e.Message); }
                    finally { Interlocked.Exchange(ref _encodeBusy, 0); }
                }
            }
            catch (Exception) { /* 종료 */ }
            finally { Interlocked.Exchange(ref _encodeBusy, 0); }
        }

        static void FlipVertical(byte[] rgba, int w, int h)
        {
            int stride = w * 4;
            var tmp = new byte[stride];
            for (int y = 0; y < h / 2; y++)
            {
                int top = y * stride, bottom = (h - 1 - y) * stride;
                Buffer.BlockCopy(rgba, top, tmp, 0, stride);
                Buffer.BlockCopy(rgba, bottom, rgba, top, stride);
                Buffer.BlockCopy(tmp, 0, rgba, bottom, stride);
            }
        }

        // ── 게임 뷰 표시 ─────────────────────────────────────────────────────────
        void OnGUI()
        {
            if (!Application.isPlaying) return;

            if (_rt != null)
            {
                // 카메라가 RT 로 그리므로 게임 뷰에는 아무것도 안 뜬다 — 여기서 되붙인다.
                float scale = Mathf.Min((float)Screen.width / _rtW, (float)Screen.height / _rtH);
                float w = _rtW * scale, h = _rtH * scale;
                GUI.DrawTexture(new Rect((Screen.width - w) * 0.5f, (Screen.height - h) * 0.5f, w, h),
                    _rt, ScaleMode.StretchToFill, false);
            }

            if (!showOverlay) return;

            string state = server == null ? "서버 없음"
                : server.Connected ? (_pose.SixDof ? "폰 연결 · 6DoF (WebXR)" : "폰 연결 · 3DoF (자이로)")
                : $"폰 기다리는 중 — 조종석에서 터널을 켜라";

            var style = new GUIStyle(GUI.skin.label) { fontSize = 14, richText = true };
            style.normal.textColor = Color.white;
            GUI.Box(new Rect(8, 6, 580, 88), GUIContent.none);
            GUI.Label(new Rect(14, 8, 740, 22), $"<b>{state}</b>", style);
            GUI.Label(new Rect(14, 28, 740, 22), StatusLine, style);
            GUI.Label(new Rect(14, 48, 740, 22), LensLine, style);
            GUI.Label(new Rect(14, 68, 740, 22),
                $"pos {transform.position.ToString("F2")} · [{recenterKey}] 리센터", style);
        }
    }
}
