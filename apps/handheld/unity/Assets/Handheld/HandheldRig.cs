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

        [Header("뷰파인더 스트림")]
        [Tooltip("폰으로 보낼 그림의 세로 해상도. 가로는 폰 화면 비율로 정해진다.")]
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

        /// <summary>조종석 창에 띄우는 한 줄.</summary>
        public string StatusLine =>
            _rt == null ? "아직 폰이 안 붙었다"
            : $"{_rtW}×{_rtH} · {_fpsShown:0.0} fps · {_lastKb} KB · 포즈 {_poseHzShown:0} Hz · 틱 {_tickHzShown:0} Hz · 캡처요청 {_captureHzShown:0} Hz · fov {_cam.fieldOfView:0.0}°";

        void Awake()
        {
            _cam = GetComponent<Camera>();
            if (server == null) server = FindAnyObjectByType<HandheldServer>();
            if (rigRoot == null) rigRoot = transform.parent;
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
            if (_cam == null) _cam = GetComponent<Camera>();

            double now = Now;
            _tickCount++;
            float dt = (float)Math.Min(now - _lastTickTime, 0.25);   // 에디터가 멈췄다 돌아오면 튀지 않게
            _lastTickTime = now;

            _recenteredThisTick = false;
            if (Application.isPlaying && Input.GetKeyDown(recenterKey)) Recenter();
            if (server.ConsumeRecenterRequest()) Recenter();

            bool gotPose = server.TryGetPose(out var pose);
            if (gotPose)
            {
                _pose = pose;
                _everGotPose = true;
                _poseCount++;
                EnsureRenderTexture(pose);
            }

            if (joystickEnabled) ApplyJoystick(server.Joystick, dt);
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

                // 폰 HUD 로 되돌려 준다 — 카메라맨이 자기가 어디 서 있는지 봐야 한다.
                Vector3 p = transform.position;
                server.SendStatus(p, transform.eulerAngles.y, _fpsShown, _lastKb,
                    _tickHzShown, _captureHzShown);
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
            if (Mathf.Abs(stick.z) > 1e-4f)
                rigRoot.RotateAround(transform.position, Vector3.up, stick.z * turnSpeed * dt);

            // 오른쪽 스틱 y = 승강 (크레인)
            if (Mathf.Abs(stick.w) > 1e-4f)
                rigRoot.position += Vector3.up * (stick.w * riseSpeed * dt);
        }

        // ── 포즈 → 카메라 ────────────────────────────────────────────────────────
        void ApplyPose(PhonePose pose, float dt)
        {
            Quaternion rot = pose.Rotation;
            Vector3 pos = pose.Position;

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
                float k = 1f - Mathf.Pow(0.5f, dt / Mathf.Max(0.001f, smoothingHalfLife));
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

            if (pose.FovY > 0f) _cam.fieldOfView = MapFov(pose.FovY, pose.Aspect);
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

        void EnsureRenderTexture(PhonePose pose)
        {
            int h = Mathf.Clamp(streamHeight, 180, 1440);
            int w = Mathf.Max(2, Mathf.RoundToInt(h * EffectiveAspect(pose.Aspect)));
            w -= w & 1;                               // 짝수로

            if (_rt != null && _rtW == w && _rtH == h) return;

            _cam.targetTexture = null;
            if (_rt != null) { _rt.Release(); DestroyRt(); }

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
            GUI.Box(new Rect(8, 6, 580, 68), GUIContent.none);
            GUI.Label(new Rect(14, 8, 740, 22), $"<b>{state}</b>", style);
            GUI.Label(new Rect(14, 28, 740, 22), StatusLine, style);
            GUI.Label(new Rect(14, 48, 740, 22),
                $"pos {transform.position.ToString("F2")} · [{recenterKey}] 리센터", style);
        }
    }
}
