using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using UnityEngine;

namespace Handheld
{
    /// <summary>폰이 보내온 카메라 포즈 한 벌 (이미 Unity 좌표계로 변환된 값).</summary>
    public struct PhonePose
    {
        public double PhoneTime;   // 폰 rAF 타임스탬프 (ms)
        public Vector3 Position;
        public Quaternion Rotation;
        public float FovY;         // 세로 화각 (도)
        public float Aspect;       // 가로/세로
        public bool SixDof;        // WebXR 6DoF 인가 (false = 자이로 3DoF)
        public float GripRoll;     // 세로 그립이면 90 — 카메라를 그만큼 굴린다
        public int Seq;
    }

    /// <summary>
    /// 폰 페이지를 서빙하고 WebSocket 으로 포즈를 받는다 / 뷰파인더 프레임을 되쏜다.
    /// 폰 1대만 붙는다고 본다 (새 연결이 오면 이전 것을 끊는다).
    /// </summary>
    [ExecuteAlways]
    [AddComponentMenu("Handheld/Handheld Server")]
    public sealed class HandheldServer : MonoBehaviour
    {
        [Header("네트워크")]
        [Tooltip("http://localhost:<port>/ 로 폰 페이지가 뜬다. cloudflared 로 이 포트를 https 로 노출한다.")]
        public int port = 8842;

        [Header("디버그")]
        public bool logToConsole = true;

        TcpListener _listener;
        Thread _acceptThread;
        volatile bool _running;

        WsConnection _client;
        readonly object _poseLock = new object();
        PhonePose _latestPose;
        bool _hasPose;
        int _seq;
        int _recenterFlag;

        // 왕복 시간(RTT) — 「튐이 망 탓인가」를 가르는 데 쓴다.
        // 1초에 한 번 우리 시계 눈금을 보내고, 폰이 **그대로 되돌려** 주면 그 차가 왕복이다.
        // 폰 시계와 우리 시계를 맞출 필요가 없다 — 같은 시계로 두 번 재기 때문이다.
        readonly System.Diagnostics.Stopwatch _clock = System.Diagnostics.Stopwatch.StartNew();
        long _pingSentAt = -1;
        volatile float _rttMs = -1f;

        /// <summary>마지막으로 잰 왕복 시간(ms). 아직 못 쟀으면 음수.</summary>
        public float RttMs => _rttMs;

        // 렌즈 요청 — 카메라맨이 폰에서 만지는 것. 값 하나짜리라 lock 대신 통째로 갈아 끼운다.
        // 리그가 한 틱에 한 번 꺼내 간다 (밀린 요청은 최신 것만 남는다 = 지연 누적 X).
        volatile object _zoomRequest;      // (object)float, 없으면 null
        volatile object _focusRequest;     // (object)Vector2 (뷰포트 0..1), 없으면 null

        // 조이스틱 — (왼쪽 x, 왼쪽 y, 오른쪽 x, 오른쪽 y), 각 -1..1.
        // 값 하나짜리라 lock 대신 통째로 갈아 끼운다 (읽는 쪽은 항상 한 벌을 본다).
        volatile object _joystick = (object)Vector4.zero;

        // 편집 모드에서는 Update 가 규칙적으로 안 돈다 = 큐에 넣으면 로그가 늦거나 안 뜬다.
        // Debug.Log 는 유니티에서 스레드 안전한 몇 안 되는 API 라 곧장 찍는다.
        void Log(string line)
        {
            if (logToConsole) Debug.Log("[Handheld] " + line);
        }

        // 포즈 기록 (조종석에서 켠다). 켜져 있을 때만 만들어진다.
        HandheldLog _recorder;
        public HandheldLog Recorder => _recorder;
        public bool Recording => _recorder != null;

        /// <summary>기록 시작 — 프로젝트 옆 HandheldLogs/ 에 CSV 두 개를 연다.</summary>
        public string StartRecording()
        {
            if (_recorder != null) return _recorder.Folder;
            string folder = Path.Combine(
                Path.GetDirectoryName(Application.dataPath) ?? ".", "HandheldLogs");
            _recorder = new HandheldLog(folder);
            Debug.Log($"[Handheld] 포즈 기록 시작 — {folder}");
            return folder;
        }

        public void StopRecording()
        {
            var r = _recorder;
            _recorder = null;
            r?.Dispose();
        }

        /// <summary>폰이 붙어 있나.</summary>
        public bool Connected => _client != null && !_client.Closed;

        volatile string _phoneDiag = "";

        /// <summary>진단이 읽을 리그. 리그가 틱마다 자기를 꽂는다.</summary>
        public HandheldRig rig;

        [Header("WebRTC")]
        [Tooltip("있으면 시그널링(w|...)을 그리로 넘긴다. 없으면 MJPEG 만 쓴다.")]
        public HandheldWebRtc webrtc;

        /// <summary>
        /// 폰으로 텍스트 한 줄. 시그널링이 이 통로를 쓴다 — 상태 줄과 같은 소켓이다.
        /// </summary>
        public void SendText(string line)
        {
            var c = _client;
            if (c != null && !c.Closed) c.SendText(line);
        }

        /// <summary>
        /// 폰이 보낸 한 줄을 처리한다. **WS 든 DataChannel 이든 같은 파서**를 탄다 —
        /// 길을 둘로 두면 규약이 반드시 갈라진다.
        /// </summary>
        public void OnPhoneText(string msg) => OnPhoneMessage(msg);

        /// <summary>새 포즈가 들어와 있으면 true 와 함께 꺼내 준다.</summary>
        public bool TryGetPose(out PhonePose pose)
        {
            lock (_poseLock)
            {
                pose = _latestPose;
                bool had = _hasPose;
                _hasPose = false;
                return had;
            }
        }

        /// <summary>
        /// 폰 화면 스틱의 지금 값. 손을 떼면 0 이 온다.
        ///
        /// **데드맨 스위치** — 연결이 죽었으면 마지막 값이 아니라 0 을 준다. 망이 끊기는
        /// 순간 폰은 「놓았다」를 못 보내므로, 그 값을 그대로 믿으면 아무도 안 미는데 리그가
        /// 계속 흐른다 (2026-08-20 실측: 2초에 0.95m). 원격 조종은 신호가 없으면 멈춰야 한다.
        /// </summary>
        public Vector4 Joystick => Connected ? (Vector4)_joystick : Vector4.zero;

        /// <summary>폰이 「리센터」를 눌렀으면 true 를 한 번 돌려준다.</summary>
        public bool ConsumeRecenterRequest() => Interlocked.Exchange(ref _recenterFlag, 0) == 1;

        /// <summary>
        /// 폰이 요청한 목표 배율을 한 번 꺼낸다. 로커를 계속 밀고 있으면 매 틱 최신 값이 나온다.
        /// </summary>
        public bool ConsumeZoomRequest(out float zoom)
        {
            object v = Interlocked.Exchange(ref _zoomRequest, null);
            if (v == null) { zoom = 0f; return false; }
            zoom = (float)v;
            return true;
        }

        /// <summary>폰이 탭한 자리(뷰포트 0..1, 아래가 0)를 한 번 꺼낸다 = 탭 포커스.</summary>
        public bool ConsumeFocusPoint(out Vector2 viewport)
        {
            object v = Interlocked.Exchange(ref _focusRequest, null);
            if (v == null) { viewport = Vector2.zero; return false; }
            viewport = (Vector2)v;
            return true;
        }

        /// <summary>
        /// 폰 HUD 에 띄울 상태 한 줄.
        /// s|x|y|z|yaw|fps|kb|틱Hz|캡처Hz|배율|초점거리mm|초점m|초점잡힘
        ///
        /// **칸은 뒤에만 붙인다** — 옛 폰 페이지는 앞 칸만 읽고 나머지를 무시하므로 안 깨진다.
        /// </summary>
        public void SendStatus(Vector3 pos, float yaw, float fps, int kb, float tickHz, float captureHz,
                               float zoom, float focalMm, float focusM, bool focusHit)
        {
            var c = _client;
            if (c == null || c.Closed) return;
            c.SendText(string.Format(CultureInfo.InvariantCulture,
                "s|{0:F2}|{1:F2}|{2:F2}|{3:F0}|{4:F1}|{5}|{6:F1}|{7:F1}|{8:F2}|{9:F0}|{10:F2}|{11}",
                pos.x, pos.y, pos.z, yaw, fps, kb, tickHz, captureHz,
                zoom, focalMm, focusM, focusHit ? 1 : 0));

            // 상태와 같은 박자로 왕복을 잰다 (1초에 한 번이면 충분하다 — 지터는 gap 이 잡는다).
            // 앞 ping 의 답이 아직 안 왔으면 새로 안 보낸다: 답 없는 ping 을 쌓으면
            // 어느 것의 답인지 알 수 없어 왕복이 거짓이 된다.
            if (_pingSentAt < 0)
            {
                _pingSentAt = _clock.ElapsedMilliseconds;
                c.SendText("k|" + _pingSentAt.ToString(CultureInfo.InvariantCulture));
            }
        }

        /// <summary>뷰파인더 JPEG 한 장을 폰으로 보낸다.</summary>
        public void SendViewfinder(byte[] jpeg)
        {
            var c = _client;
            if (c != null && !c.Closed) c.SendBinary(jpeg);
        }

        void OnEnable()
        {
            // 창이 뒤로 가면 에디터·플레이어가 멈춘다 = 폰 화면이 그대로 얼어붙는다.
            // 손카메라는 유니티 창을 안 보면서 쓰는 물건이라 이건 필수다.
            Application.runInBackground = true;

            _running = true;
            try
            {
                _listener = new TcpListener(IPAddress.Any, port);
                _listener.Start();
            }
            catch (Exception e)
            {
                Debug.LogError($"[Handheld] {port} 포트를 못 열었다: {e.Message}");
                _running = false;
                return;
            }
            _acceptThread = new Thread(AcceptLoop) { IsBackground = true, Name = "handheld-accept" };
            _acceptThread.Start();
            Debug.Log($"[Handheld] 서버 켜짐 — http://localhost:{port}/");
        }

        void OnDisable()
        {
            StopRecording();
            _running = false;
            try { _listener?.Stop(); } catch { }
            _client?.Close();
            _client = null;
            _listener = null;
        }

        void Update()
        {
            Tick();
        }

        /// <summary>
        /// 편집 모드에서는 Update 가 규칙적으로 안 돈다 — 조종석 창이 이걸 대신 부른다.
        /// 스틱 해제가 여기 걸려 있으니 안 불리면 데드맨이 늦게 듣는다.
        /// </summary>
        public void Tick()
        {
            ReleaseSticksIfDisconnected();
            _recorder?.Flush();
            if (webrtc == null) webrtc = GetComponent<HandheldWebRtc>();
            if (webrtc != null && webrtc.isActiveAndEnabled) webrtc.Tick();
        }

        void AcceptLoop()
        {
            while (_running)
            {
                TcpClient tcp = null;
                try
                {
                    tcp = _listener.AcceptTcpClient();
                }
                catch (Exception)
                {
                    if (_running) Log("accept 중단");
                    return;
                }

                try { HandleConnection(tcp); }
                catch (Exception e)
                {
                    Log("연결 처리 실패: " + e.Message);
                    try { tcp.Close(); } catch { }
                }
            }
        }

        /// <summary>연결이 죽었으면 스틱을 0 으로 되돌린다 (틱마다 확인).</summary>
        void ReleaseSticksIfDisconnected()
        {
            if (Connected) return;
            if ((Vector4)_joystick != Vector4.zero) _joystick = (object)Vector4.zero;
        }

        void HandleConnection(TcpClient tcp)
        {
            tcp.NoDelay = true;
            var stream = tcp.GetStream();
            string headers = ReadHeaders(stream);
            if (headers == null) { tcp.Close(); return; }

            string upgrade = HttpUtil.HeaderValue(headers, "Upgrade");
            string path = HttpUtil.RequestPath(headers);

            if (!string.IsNullOrEmpty(upgrade) && upgrade.IndexOf("websocket", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                var conn = WsConnection.Accept(tcp, headers);
                if (conn == null) { tcp.Close(); return; }
                conn.OnText = OnPhoneMessage;
                conn.OnLog = Log;

                var old = _client;
                _client = conn;
                _joystick = (object)Vector4.zero;      // 새 폰이 붙으면 이전 스틱 값을 물려받지 않는다
                _zoomRequest = null;                   // 렌즈 요청도 마찬가지 — 옛 폰의 마지막 배율이 튀면 안 된다
                _focusRequest = null;
                _pingSentAt = -1;                      // 답을 못 받은 ping 을 새 폰에 물려주지 않는다
                _rttMs = -1f;
                old?.Close();
                Log("폰 붙음");
                return;
            }

            ServeStatic(stream, path);
            tcp.Close();
        }

        static string ReadHeaders(NetworkStream stream)
        {
            var sb = new StringBuilder();
            var one = new byte[1];
            int matched = 0; // "\r\n\r\n" 진행도
            while (sb.Length < 16 * 1024)
            {
                int n;
                try { n = stream.Read(one, 0, 1); }
                catch { return null; }
                if (n <= 0) return null;
                char c = (char)one[0];
                sb.Append(c);
                if ((matched == 0 || matched == 2) && c == '\r') matched++;
                else if ((matched == 1 || matched == 3) && c == '\n') { matched++; if (matched == 4) return sb.ToString(); }
                else matched = 0;
            }
            return null;
        }

        // ── 정적 파일 ────────────────────────────────────────────────────────────
        void ServeStatic(NetworkStream stream, string path)
        {
            // ★ 진단 창구 — 폰이 붙어 있는 채로도 밖에서 상태를 읽는다 (TASK-KAR-245).
            //   WS 를 하나 더 붙여 재면 **폰이 끊긴다**(서버는 한 대만 받는다). HTTP 는 무관하다.
            if (path == "/diag")
            {
                WriteResponse(stream, "200 OK", "application/json; charset=utf-8",
                    Encoding.UTF8.GetBytes(DiagJson()));
                return;
            }

            if (path == "/") path = "/index.html";
            string root = Path.Combine(Application.streamingAssetsPath, "handheld");
            string full = Path.GetFullPath(Path.Combine(root, path.TrimStart('/')));

            // 경로 탈출 차단
            if (!full.StartsWith(Path.GetFullPath(root), StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
            {
                WriteResponse(stream, "404 Not Found", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("없다: " + path));
                return;
            }

            byte[] body;
            try { body = File.ReadAllBytes(full); }
            catch (Exception e)
            {
                WriteResponse(stream, "500 Internal Server Error", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes(e.Message));
                return;
            }
            WriteResponse(stream, "200 OK", MimeOf(full), body);
        }

        /// <summary>지금 상태 한 벌 (JSON). 사람 눈이 아니라 기계가 읽는다.</summary>
        string DiagJson()
        {
            var c = CultureInfo.InvariantCulture;
            var sb = new StringBuilder("{");
            sb.AppendFormat(c, "\"connected\":{0},", Connected ? 1 : 0);
            sb.AppendFormat(c, "\"poseSeq\":{0},", _seq);
            sb.AppendFormat(c, "\"rttMs\":{0:F0},", _rttMs);
            var j = (Vector4)_joystick;
            sb.AppendFormat(c, "\"stick\":\"{0:F2},{1:F2},{2:F2},{3:F2}\",", j.x, j.y, j.z, j.w);
            sb.AppendFormat(c, "\"recording\":{0},", Recording ? 1 : 0);
            sb.AppendFormat(c, "\"phone\":\"{0}\",", (_phoneDiag ?? "").Replace("\"", "'"));

            var w = webrtc;
            sb.AppendFormat(c, "\"rtc\":\"{0}\",", w == null ? "없음" : w.StatusLine.Replace("\"", "'"));

            var r = rig;
            sb.Append("\"rig\":{");
            if (r != null) sb.Append(r.DiagJson());
            sb.Append("}}");
            return sb.ToString();
        }

        static string MimeOf(string p)
        {
            switch (Path.GetExtension(p).ToLowerInvariant())
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": return "application/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".png": return "image/png";
                case ".svg": return "image/svg+xml";
                default: return "application/octet-stream";
            }
        }

        static void WriteResponse(NetworkStream stream, string status, string mime, byte[] body)
        {
            var head = Encoding.UTF8.GetBytes(
                "HTTP/1.1 " + status + "\r\n" +
                "Content-Type: " + mime + "\r\n" +
                "Content-Length: " + body.Length + "\r\n" +
                "Cache-Control: no-store\r\n" +
                "Connection: close\r\n\r\n");
            stream.Write(head, 0, head.Length);
            stream.Write(body, 0, body.Length);
            stream.Flush();
        }

        // ── 폰 메시지 ────────────────────────────────────────────────────────────
        // 포즈:  p|t|px|py|pz|qx|qy|qz|qw|fovY|aspect|dof
        // 좌표계 변환(WebXR/three RH,-Z front → Unity LH,+Z front)은 폰 쪽이 아니라
        // 여기서 한다 — 폰은 원본만 보내고 규약은 한 곳에만 둔다.
        void OnPhoneMessage(string msg)
        {
            if (string.IsNullOrEmpty(msg)) return;

            if (msg == "c|recenter") { Interlocked.Exchange(ref _recenterFlag, 1); return; }

            // 폰 자기 진단:  d|모드|AR설정|그립|방향|각도|화면크기|전송|프레임크기
            if (msg.Length > 2 && msg[0] == 'd' && msg[1] == '|')
            {
                _phoneDiag = msg.Substring(2);
                return;
            }

            // WebRTC 시그널링:  w|offer|… · w|ice|… · w|bye
            // 여기는 수신 스레드다 — 넘기기만 하고 처리는 틱에서 한다.
            if (msg.Length > 2 && msg[0] == 'w' && msg[1] == '|')
            {
                var rtc = webrtc;
                if (rtc != null) rtc.EnqueueSignal(msg);
                return;
            }

            // 왕복 답장:  k|<보낼 때 찍은 눈금>  — 폰은 받은 것을 그대로 되돌린다.
            if (msg.Length > 2 && msg[0] == 'k' && msg[1] == '|')
            {
                try
                {
                    long sent = long.Parse(msg.Substring(2), CultureInfo.InvariantCulture);
                    // 우리가 보낸 그 ping 의 답일 때만 센다 (옛 답·장난 값 방어).
                    if (sent == _pingSentAt)
                    {
                        _rttMs = _clock.ElapsedMilliseconds - sent;
                        _pingSentAt = -1;               // 다음 ping 을 보낼 수 있게 푼다
                    }
                }
                catch (Exception e) { Log("왕복 파싱 실패: " + e.Message); }
                return;
            }

            // 줌:  z|배율   (로커를 미는 동안 30Hz. 리그가 램프로 이어 준다)
            if (msg.Length > 2 && msg[0] == 'z' && msg[1] == '|')
            {
                try
                {
                    float z = P(msg.Substring(2));
                    // 여기서는 넓게만 막는다 — 실제 한계(zoomMin/Max)는 리그가 안다.
                    if (!float.IsNaN(z) && !float.IsInfinity(z))
                        _zoomRequest = (object)Mathf.Clamp(z, 0.05f, 100f);
                }
                catch (Exception e) { Log("줌 파싱 실패: " + e.Message); }
                return;
            }

            // 탭 포커스:  f|u|v   (뷰포트 0..1, 아래가 0 — 폰이 이미 그렇게 보낸다)
            if (msg.Length > 2 && msg[0] == 'f' && msg[1] == '|')
            {
                var t = msg.Split('|');
                if (t.Length < 3) return;
                try
                {
                    float u = P(t[1]), v = P(t[2]);
                    if (float.IsNaN(u) || float.IsNaN(v)) return;
                    _focusRequest = (object)new Vector2(Mathf.Clamp01(u), Mathf.Clamp01(v));
                }
                catch (Exception e) { Log("초점 파싱 실패: " + e.Message); }
                return;
            }

            // 조이스틱:  j|lx|ly|rx|ry
            if (msg.Length > 2 && msg[0] == 'j' && msg[1] == '|')
            {
                var j = msg.Split('|');
                if (j.Length < 5) return;
                try
                {
                    _joystick = (object)new Vector4(
                        Mathf.Clamp(P(j[1]), -1f, 1f), Mathf.Clamp(P(j[2]), -1f, 1f),
                        Mathf.Clamp(P(j[3]), -1f, 1f), Mathf.Clamp(P(j[4]), -1f, 1f));
                }
                catch (Exception e) { Log("스틱 파싱 실패: " + e.Message); }
                return;
            }

            var f = msg.Split('|');
            if (f.Length < 12 || f[0] != "p") return;

            try
            {
                double t = double.Parse(f[1], CultureInfo.InvariantCulture);
                float px = P(f[2]), py = P(f[3]), pz = P(f[4]);
                float qx = P(f[5]), qy = P(f[6]), qz = P(f[7]), qw = P(f[8]);
                float fov = P(f[9]), aspect = P(f[10]);
                bool six = f[11] == "6";

                // 13번째 칸 = 그립 롤. 옛 폰 페이지는 안 보내므로 없으면 0.
                float gripRoll = f.Length > 12 ? P(f[12]) : 0f;

                var pose = new PhonePose
                {
                    PhoneTime = t,
                    Position = new Vector3(px, py, -pz),
                    Rotation = new Quaternion(-qx, -qy, qz, qw),
                    FovY = Mathf.Clamp(fov, 1f, 170f),
                    Aspect = Mathf.Clamp(aspect, 0.2f, 5f),
                    SixDof = six,
                    GripRoll = Mathf.Clamp(gripRoll, -180f, 180f),
                    Seq = Interlocked.Increment(ref _seq),
                };

                lock (_poseLock) { _latestPose = pose; _hasPose = true; }

                _recorder?.Pose(pose.Seq, t, px, py, pz, qx, qy, qz, qw, fov, aspect, f[11],
                    pose.Position, pose.Rotation, _rttMs);
            }
            catch (Exception e)
            {
                Log("포즈 파싱 실패: " + e.Message);
            }
        }

        static float P(string s) => float.Parse(s, CultureInfo.InvariantCulture);
    }
}
