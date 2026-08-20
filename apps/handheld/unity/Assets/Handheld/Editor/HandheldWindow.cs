using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEngine;
using Debug = UnityEngine.Debug;

namespace Handheld.EditorTools
{
    /// <summary>
    /// 핸드헬드 조종석 — 체크박스 하나로 서버·터널을 켜고, 뜬 주소를 QR 로 띄운다.
    /// 메뉴: Handheld / 조종석. TASK-KAR-230.
    ///
    /// Play 를 누르지 않아도 돌아간다 — 서버·리그가 ExecuteAlways 이고, 편집 모드에서는
    /// 이 창이 EditorApplication.update 로 리그를 돌린다.
    /// </summary>
    public sealed class HandheldWindow : EditorWindow
    {
        HandheldServer _server;
        HandheldRig _rig;

        Process _tunnel;
        string _tunnelUrl = "";
        string _tunnelLog = "";
        Texture2D _qr;
        string _qrFor = "";
        Vector2 _scroll;

        [MenuItem("Handheld/조종석 %#h")]
        public static void Open()
        {
            var w = GetWindow<HandheldWindow>("핸드헬드");
            w.minSize = new Vector2(320, 460);
        }

        /// <summary>
        /// 씬까지 열고 조종석을 띄운다 — 배치로 유니티를 시작할 때의 진입점.
        /// -executeMethod Handheld.EditorTools.HandheldWindow.OpenWithScene
        /// </summary>
        public static void OpenWithScene()
        {
            HandheldSetup.OpenScene();
            Open();
        }

        void OnEnable()
        {
            EditorApplication.update += Tick;
            FindRig();
        }

        void OnDisable()
        {
            EditorApplication.update -= Tick;
            StopTunnel();
            if (_qr != null) DestroyImmediate(_qr);
        }

        void FindRig()
        {
            if (_server == null) _server = FindAnyObjectByType<HandheldServer>();
            if (_rig == null) _rig = FindAnyObjectByType<HandheldRig>();
        }

        /// <summary>편집 모드에서도 리그가 돌게 한다 — Play 없이 폰이 붙어 움직인다.</summary>
        void Tick()
        {
            FindRig();
            if (!Application.isPlaying)
            {
                // 편집 모드에서는 MonoBehaviour.Update 가 규칙적으로 안 돈다 — 여기가 심장이다.
                if (_server != null && _server.isActiveAndEnabled) _server.Tick();
                if (_rig != null && _rig.isActiveAndEnabled) _rig.ManualTick(true);
            }

            ReadTunnelLog();
            Repaint();
        }

        void OnGUI()
        {
            _scroll = EditorGUILayout.BeginScrollView(_scroll);

            if (_server == null)
            {
                EditorGUILayout.HelpBox("씬에 HandheldServer 가 없다.", MessageType.Info);
                if (GUILayout.Button("테스트 씬 만들기", GUILayout.Height(28))) HandheldSetup.BuildScene();
                EditorGUILayout.EndScrollView();
                return;
            }

            DrawServerSection();
            EditorGUILayout.Space(8);
            DrawTunnelSection();
            EditorGUILayout.Space(8);
            DrawQrSection();
            EditorGUILayout.Space(8);
            DrawRigSection();
            EditorGUILayout.Space(8);
            DrawLensSection();
            EditorGUILayout.Space(8);
            DrawUrpSection();
            EditorGUILayout.Space(8);
            DrawRecordSection();

            EditorGUILayout.EndScrollView();
        }

        // ── 서버 ─────────────────────────────────────────────────────────────────
        void DrawServerSection()
        {
            Header("웹서버");

            bool on = _server.enabled && _server.gameObject.activeInHierarchy;
            bool want = EditorGUILayout.ToggleLeft(
                on ? $"켜짐 — 포트 {_server.port}" : "꺼짐", on, EditorStyles.boldLabel);
            if (want != on)
            {
                Undo.RecordObject(_server, "핸드헬드 서버 토글");
                if (want && !_server.gameObject.activeSelf) _server.gameObject.SetActive(true);
                _server.enabled = want;
                EditorUtility.SetDirty(_server);
            }

            using (new EditorGUI.DisabledScope(on))
            {
                int port = EditorGUILayout.IntField("포트", _server.port);
                if (port != _server.port)
                {
                    Undo.RecordObject(_server, "핸드헬드 포트");
                    _server.port = Mathf.Clamp(port, 1024, 65535);
                    EditorUtility.SetDirty(_server);
                }
            }

            if (on)
            {
                EditorGUILayout.LabelField(_server.Connected ? "폰 붙음" : "폰 기다리는 중",
                    _server.Connected ? Ok() : EditorStyles.miniLabel);
            }
        }

        // ── 터널 ─────────────────────────────────────────────────────────────────
        void DrawTunnelSection()
        {
            Header("공개 주소 (https)");
            EditorGUILayout.LabelField(
                "폰 센서는 https 에서만 돈다 — 터널을 켜야 폰이 붙는다.", WrapMini());

            bool running = _tunnel != null && !_tunnel.HasExited;
            bool want = EditorGUILayout.ToggleLeft(
                running ? (string.IsNullOrEmpty(_tunnelUrl) ? "여는 중…" : "열림") : "꺼짐",
                running, EditorStyles.boldLabel);

            if (want != running)
            {
                if (want) StartTunnel();
                else StopTunnel();
            }

            if (!string.IsNullOrEmpty(_tunnelUrl))
            {
                EditorGUILayout.SelectableLabel(_tunnelUrl, EditorStyles.textField,
                    GUILayout.Height(EditorGUIUtility.singleLineHeight));
                using (new EditorGUILayout.HorizontalScope())
                {
                    if (GUILayout.Button("주소 복사")) EditorGUIUtility.systemCopyBuffer = _tunnelUrl;
                    if (GUILayout.Button("브라우저로 열기")) Application.OpenURL(_tunnelUrl);
                }
            }
            else if (running)
            {
                EditorGUILayout.LabelField("cloudflared 가 주소를 받는 중…", EditorStyles.miniLabel);
            }
        }

        void StartTunnel()
        {
            string exe = FindCloudflared();
            if (exe == null)
            {
                EditorUtility.DisplayDialog("cloudflared 없음",
                    "cloudflared 를 못 찾았다.\n\nwinget install --id Cloudflare.cloudflared", "알겠다");
                return;
            }

            // 다른 서비스용 ~/.cloudflared/config.yml 이 잡히면 그 ingress 규칙(catch-all 404)이
            // --url 을 눌러 모든 요청이 빈 404 가 된다. 이 터널만의 설정으로 격리한다.
            string dir = Path.Combine(Path.GetTempPath(), "handheld-tunnel");
            Directory.CreateDirectory(dir);
            string cfg = Path.Combine(dir, "config.yml");
            File.WriteAllText(cfg, $"url: http://127.0.0.1:{_server.port}\n");

            _tunnelUrl = "";
            _tunnelLog = "";
            var psi = new ProcessStartInfo(exe,
                $"--config \"{cfg}\" tunnel --url http://127.0.0.1:{_server.port}")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                StandardErrorEncoding = Encoding.UTF8,
                StandardOutputEncoding = Encoding.UTF8,
            };

            _tunnel = new Process { StartInfo = psi, EnableRaisingEvents = true };
            _tunnel.ErrorDataReceived += (_, e) => { if (e.Data != null) lock (this) _tunnelLog += e.Data + "\n"; };
            _tunnel.OutputDataReceived += (_, e) => { if (e.Data != null) lock (this) _tunnelLog += e.Data + "\n"; };
            _tunnel.Start();
            _tunnel.BeginErrorReadLine();
            _tunnel.BeginOutputReadLine();
        }

        void ReadTunnelLog()
        {
            if (_tunnel == null || !string.IsNullOrEmpty(_tunnelUrl)) return;
            string log;
            lock (this) log = _tunnelLog;
            var m = Regex.Match(log, @"https://[a-z0-9-]+\.trycloudflare\.com");
            if (m.Success)
            {
                _tunnelUrl = m.Value;
                Debug.Log($"[Handheld] 공개 주소: {_tunnelUrl}");
            }
        }

        void StopTunnel()
        {
            if (_tunnel == null) return;
            try { if (!_tunnel.HasExited) _tunnel.Kill(); } catch { }
            try { _tunnel.Dispose(); } catch { }
            _tunnel = null;
            _tunnelUrl = "";
        }

        static string FindCloudflared()
        {
            string[] candidates =
            {
                @"C:\Program Files (x86)\cloudflared\cloudflared.exe",
                @"C:\Program Files\cloudflared\cloudflared.exe",
                "/usr/local/bin/cloudflared",
                "/opt/homebrew/bin/cloudflared",
            };
            foreach (string c in candidates) if (File.Exists(c)) return c;

            // PATH 에 있으면 그것도 받는다
            string path = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string dir in path.Split(Path.PathSeparator))
            {
                if (string.IsNullOrWhiteSpace(dir)) continue;
                foreach (string name in new[] { "cloudflared.exe", "cloudflared" })
                {
                    try { string p = Path.Combine(dir, name); if (File.Exists(p)) return p; }
                    catch { }
                }
            }
            return null;
        }

        // ── QR ───────────────────────────────────────────────────────────────────
        void DrawQrSection()
        {
            if (string.IsNullOrEmpty(_tunnelUrl)) return;

            Header("폰으로 찍기");
            EnsureQr(_tunnelUrl);
            if (_qr == null) return;

            float side = Mathf.Min(position.width - 30f, 240f);
            var rect = GUILayoutUtility.GetRect(side, side, GUILayout.ExpandWidth(false));
            rect.x = (position.width - side) * 0.5f;
            rect.width = rect.height = side;

            var prev = FilterMode.Point;
            _qr.filterMode = prev;                       // 흐려지면 못 읽는다
            GUI.DrawTexture(rect, _qr, ScaleMode.ScaleToFit, false);

            EditorGUILayout.LabelField("폰 카메라로 찍고 「시작 (6DoF)」", CenteredMini());
        }

        void EnsureQr(string url)
        {
            if (_qr != null && _qrFor == url) return;
            if (_qr != null) DestroyImmediate(_qr);

            bool[,] modules = QrCode.Encode(url);
            if (modules == null) { _qr = null; return; }

            const int Quiet = 4;                          // 규격이 요구하는 여백
            int n = modules.GetLength(0);
            int size = n + Quiet * 2;

            _qr = new Texture2D(size, size, TextureFormat.RGB24, false) { filterMode = FilterMode.Point };
            var px = new Color32[size * size];
            var white = new Color32(255, 255, 255, 255);
            var black = new Color32(0, 0, 0, 255);
            for (int i = 0; i < px.Length; i++) px[i] = white;

            for (int y = 0; y < n; y++)
            {
                for (int x = 0; x < n; x++)
                {
                    if (!modules[y, x]) continue;
                    // 텍스처는 아래에서 위로 채워지니 y 를 뒤집어야 QR 이 바로 선다
                    int ty = size - 1 - (y + Quiet);
                    px[ty * size + x + Quiet] = black;
                }
            }
            _qr.SetPixels32(px);
            _qr.Apply();
            _qrFor = url;
        }

        // ── 리그 손잡이 ──────────────────────────────────────────────────────────
        void DrawRigSection()
        {
            if (_rig == null) return;
            Header("카메라");

            using (var check = new EditorGUI.ChangeCheckScope())
            {
                _rig.aspectMode = (HandheldRig.AspectMode)EditorGUILayout.EnumPopup("화면 비율", _rig.aspectMode);
                if (_rig.aspectMode == HandheldRig.AspectMode.Custom)
                    _rig.customAspect = EditorGUILayout.FloatField("가로/세로", _rig.customAspect);
                if (_rig.aspectMode != HandheldRig.AspectMode.PhoneNative)
                    _rig.fovAxis = (HandheldRig.FovAxis)EditorGUILayout.EnumPopup("화각 기준", _rig.fovAxis);
                EditorGUILayout.LabelField(" ", "폰 화면엔 레터박스로 뜬다 — 보이는 것 = 나가는 것",
                    EditorStyles.miniLabel);

                EditorGUILayout.Space(4);
                _rig.streamFps = EditorGUILayout.IntSlider("뷰파인더 fps", _rig.streamFps, 1, 120);
                _rig.streamHeight = EditorGUILayout.IntSlider("세로 해상도", _rig.streamHeight, 180, 1440);
                _rig.jpegQuality = EditorGUILayout.IntSlider("화질", _rig.jpegQuality, 20, 95);
                _rig.worldScale = EditorGUILayout.Slider("월드 배율", _rig.worldScale, 0.05f, 10f);

                EditorGUILayout.Space(4);
                _rig.smoothing = EditorGUILayout.Toggle("보간 (떨림 줄이기)", _rig.smoothing);
                using (new EditorGUI.DisabledScope(!_rig.smoothing))
                {
                    _rig.smoothingHalfLife = EditorGUILayout.Slider(
                        "반감기 (초)", _rig.smoothingHalfLife, 0.005f, 0.25f);
                    EditorGUILayout.LabelField(" ",
                        $"클수록 부드럽고 그만큼 늦다 — 지금 ≈ {_rig.smoothingHalfLife * 1000f:0} ms",
                        EditorStyles.miniLabel);
                }

                EditorGUILayout.Space(4);
                _rig.joystickEnabled = EditorGUILayout.Toggle("조이스틱 (걸어다니기)", _rig.joystickEnabled);
                using (new EditorGUI.DisabledScope(!_rig.joystickEnabled))
                {
                    _rig.moveSpeed = EditorGUILayout.Slider("이동 m/s", _rig.moveSpeed, 0.1f, 10f);
                    _rig.turnSpeed = EditorGUILayout.Slider("회전 °/s", _rig.turnSpeed, 10f, 360f);
                    _rig.riseSpeed = EditorGUILayout.Slider("승강 m/s", _rig.riseSpeed, 0.1f, 5f);
                }

                if (check.changed) EditorUtility.SetDirty(_rig);
            }

            EditorGUILayout.Space(4);
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("리센터")) _rig.Recenter();
                if (GUILayout.Button("원점으로")) _rig.ResetRig();
            }

            EditorGUILayout.Space(4);
            EditorGUILayout.LabelField(_rig.StatusLine, WrapMini());
        }

        // ── 렌즈 (줌 · 초점) ─────────────────────────────────────────────────────
        void DrawLensSection()
        {
            if (_rig == null) return;
            Header("렌즈 — 줌 · 초점");
            EditorGUILayout.LabelField(
                "줌·초점은 **카메라맨(폰)** 이 잡는다. 여기서는 감독이 한계와 룩을 정하고, " +
                "필요하면 손으로 뺏어 온다.", WrapMini());

            EditorGUILayout.LabelField(_rig.LensLine, EditorStyles.boldLabel);

            using (var check = new EditorGUI.ChangeCheckScope())
            {
                _rig.physicalCamera = EditorGUILayout.Toggle("물리 카메라 (mm·f값)", _rig.physicalCamera);
                using (new EditorGUI.DisabledScope(!_rig.physicalCamera))
                    _rig.sensorWidthMm = EditorGUILayout.Slider("센서 가로 mm", _rig.sensorWidthMm, 6f, 70f);

                EditorGUILayout.Space(4);
                float z = EditorGUILayout.Slider("목표 배율", _rig.ZoomTarget,
                    Mathf.Min(_rig.zoomMin, _rig.zoomMax), Mathf.Max(_rig.zoomMin, _rig.zoomMax));
                if (!Mathf.Approximately(z, _rig.ZoomTarget)) _rig.ZoomTarget = z;

                using (new EditorGUILayout.HorizontalScope())
                {
                    EditorGUILayout.LabelField("빠른 배율", GUILayout.Width(EditorGUIUtility.labelWidth - 4));
                    foreach (float preset in new[] { 1f, 2f, 4f, 8f })
                        if (GUILayout.Button(preset + "×")) _rig.ZoomTarget = preset;
                }

                _rig.zoomMin = EditorGUILayout.FloatField("배율 최소", _rig.zoomMin);
                _rig.zoomMax = EditorGUILayout.FloatField("배율 최대", _rig.zoomMax);
                _rig.zoomRampHalfLife = EditorGUILayout.Slider("줌 반감기 (초)", _rig.zoomRampHalfLife, 0f, 0.6f);

                EditorGUILayout.Space(4);
                _rig.zoomStabilize = EditorGUILayout.Slider("망원 손떨림 상쇄", _rig.zoomStabilize, 0f, 1f);
                EditorGUILayout.LabelField(" ",
                    $"지금 실효 반감기 ≈ {EffectiveHalfLifeMs():0} ms — 배율만큼 늘려 화면에서 " +
                    "보이는 떨림을 일정하게 둔다", WrapMini());
                _rig.maxStabilizedHalfLife = EditorGUILayout.Slider(
                    "그 천장 (초)", _rig.maxStabilizedHalfLife, 0.02f, 1f);
                _rig.zoomSlowsTurn = EditorGUILayout.Toggle("망원에서 스틱 회전 늦추기", _rig.zoomSlowsTurn);

                EditorGUILayout.Space(6);
                _rig.focusMode = (HandheldRig.FocusMode)EditorGUILayout.EnumPopup("초점 모드", _rig.focusMode);
                EditorGUILayout.LabelField(" ", FocusModeNote(_rig.focusMode), WrapMini());

                using (new EditorGUI.DisabledScope(
                    _rig.focusMode == HandheldRig.FocusMode.AutoCenter ||
                    _rig.focusMode == HandheldRig.FocusMode.Target))
                {
                    _rig.focusDistance = EditorGUILayout.Slider(
                        "초점 거리 (m)", _rig.focusDistance, _rig.focusMin, Mathf.Min(_rig.focusMax, 60f));
                }

                if (_rig.focusMode == HandheldRig.FocusMode.Target)
                    _rig.focusTarget = (Transform)EditorGUILayout.ObjectField(
                        "따라갈 물건", _rig.focusTarget, typeof(Transform), true);

                _rig.aperture = EditorGUILayout.Slider("조리개 f/", _rig.aperture, 0.7f, 32f);
                _rig.focusRampHalfLife = EditorGUILayout.Slider(
                    "랙 포커스 반감기 (초)", _rig.focusRampHalfLife, 0f, 1.5f);
                _rig.focusMask = LayerMaskField("초점이 잡을 레이어", _rig.focusMask);

                if (check.changed) EditorUtility.SetDirty(_rig);
            }
        }

        float EffectiveHalfLifeMs()
        {
            if (_rig == null) return 0f;
            float hl = _rig.smoothingHalfLife;
            if (_rig.zoomStabilize > 0f)
                hl = _rig.smoothingHalfLife * Mathf.Lerp(1f, Mathf.Max(0.25f, _rig.Zoom), _rig.zoomStabilize);
            return Mathf.Clamp(hl, 0.005f, Mathf.Max(_rig.smoothingHalfLife, _rig.maxStabilizedHalfLife)) * 1000f;
        }

        static string FocusModeNote(HandheldRig.FocusMode m)
        {
            switch (m)
            {
                case HandheldRig.FocusMode.Manual: return "감독이 정한 거리에 고정 — 폰 탭도 안 먹는다";
                case HandheldRig.FocusMode.AutoCenter: return "화면 한가운데를 계속 잡는다. 폰에서 탭하면 그 자리로 고정된다";
                case HandheldRig.FocusMode.Point: return "마지막으로 탭한 자리에 고정 — 「자동」으로 되돌리려면 위에서 바꿔라";
                case HandheldRig.FocusMode.Target: return "지정한 물건을 계속 잡는다 (아바타 머리 등). 방송에서 제일 안전하다";
                default: return "";
            }
        }

        static LayerMask LayerMaskField(string label, LayerMask mask)
        {
            int value = EditorGUILayout.MaskField(label, UnityEditorInternal.InternalEditorUtility.LayerMaskToConcatenatedLayersMask(mask),
                UnityEditorInternal.InternalEditorUtility.layers);
            return UnityEditorInternal.InternalEditorUtility.ConcatenatedLayersMaskToLayerMask(value);
        }

        // ── URP (초점 흐림) ──────────────────────────────────────────────────────
        void DrawUrpSection()
        {
            Header("초점 흐림 (URP)");
            EditorGUILayout.LabelField(
                "초점 **값**은 파이프라인 없이도 나온다. 실제로 **흐리게 그리는** 건 URP 몫이다.",
                WrapMini());

            EditorGUILayout.LabelField(HandheldUrpInstaller.StatusLine,
                HandheldUrpInstaller.UrpActive ? Ok() : EditorStyles.miniLabel);

            using (new EditorGUI.DisabledScope(HandheldUrpInstaller.Installing))
            {
                if (!HandheldUrpInstaller.UrpInstalled)
                {
                    if (GUILayout.Button("URP 켜기 (설치 + 배선)", GUILayout.Height(26)))
                        HandheldUrpInstaller.InstallAndWire();
                    EditorGUILayout.LabelField(
                        "패키지를 받고 컴파일이 한 번 돌아간다 — 끝나면 알아서 배선까지 한다.",
                        WrapMini());
                }
                else if (!HandheldUrpInstaller.UrpActive)
                {
                    if (GUILayout.Button("배선만 다시", GUILayout.Height(26)))
                        HandheldUrpInstaller.Wire();
                }
                else
                {
                    if (GUILayout.Button("씬에 초점 흐림 다시 붙이기"))
                        EditorApplication.ExecuteMenuItem("Handheld/URP/씬에 초점 흐림 붙이기");
                }
            }
        }

        // ── 포즈 기록 ────────────────────────────────────────────────────────────
        void DrawRecordSection()
        {
            Header("포즈 기록");
            EditorGUILayout.LabelField(
                "폰 원본 · 좌표변환 후 · 보간 후를 각각 CSV 로 남긴다. 「튄다」가 폰에서 오는지 " +
                "여기서 생기는지 가르는 데 쓴다.", WrapMini());

            bool on = _server.Recording;
            bool want = EditorGUILayout.ToggleLeft(
                on ? $"기록 중 — 포즈 {_server.Recorder.PoseRows}줄 · 화면 {_server.Recorder.ShownRows}줄" : "꺼짐",
                on, EditorStyles.boldLabel);

            if (want != on)
            {
                if (want) _server.StartRecording();
                else _server.StopRecording();
            }

            using (new EditorGUI.DisabledScope(_lastLogFolder == null))
            {
                if (GUILayout.Button("기록 폴더 열기") && _lastLogFolder != null)
                    EditorUtility.RevealInFinder(_lastLogFolder);
            }

            if (on) _lastLogFolder = _server.Recorder.Folder;
        }

        string _lastLogFolder;

        // ── 잡동사니 ─────────────────────────────────────────────────────────────
        static void Header(string title)
        {
            EditorGUILayout.LabelField(title, EditorStyles.boldLabel);
            var r = GUILayoutUtility.GetRect(1, 1, GUILayout.ExpandWidth(true));
            EditorGUI.DrawRect(r, new Color(0.5f, 0.5f, 0.5f, 0.25f));
            EditorGUILayout.Space(2);
        }

        static GUIStyle Ok()
        {
            var s = new GUIStyle(EditorStyles.miniLabel);
            s.normal.textColor = new Color(0.35f, 0.75f, 0.5f);
            return s;
        }

        static GUIStyle WrapMini()
        {
            var s = new GUIStyle(EditorStyles.miniLabel) { wordWrap = true };
            return s;
        }

        static GUIStyle CenteredMini()
        {
            var s = new GUIStyle(EditorStyles.miniLabel) { alignment = TextAnchor.MiddleCenter };
            return s;
        }
    }
}
