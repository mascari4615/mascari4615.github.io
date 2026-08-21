using System;
using System.Collections;
using System.Collections.Generic;
using Unity.WebRTC;
using UnityEngine;

namespace Handheld
{
    /// <summary>
    /// 폰과의 WebRTC 연결 한 벌. TASK-KAR-245.
    ///
    /// **왜 WebRTC 인가** (2026-08-21 정정된 근거):
    ///   ① 뷰파인더 MJPEG 이 862KB/s ≈ 7Mbps 의 PC **업링크**를 먹는다 — OBS 송출이 같은
    ///      회선을 쓴다. H.264 델타 압축이면 1/8 로 준다.
    ///   ② 폰이 초당 30~60장을 JPEG 디코드하느라 CPU 를 WebXR rAF 와 나눠 쓴다 =
    ///      **포즈 생성 자체가 늦어진다.** 하드웨어 H.264 디코드는 그 비용이 거의 0.
    ///   (예전에 적었던 「영상이 포즈를 막는다」는 **틀렸다** — TCP 는 전이중이고 둘은
    ///    방향이 반대다. 그 문장에 기대지 마라.)
    ///
    /// **MJPEG 을 지우지 않는다.** 이 리그는 Play 없이도 쓰는 물건인데 영상 트랙은 Play 를
    /// 요구한다(`WebRTC.Update()` 가 `WaitForEndOfFrame` 을 기다린다). 그래서 WebRTC 는
    /// *더 좋은 길*이고 MJPEG 은 *늘 있는 길*이다 — 안 붙으면 조용히 그리로 떨어진다.
    /// 방송 중에 길이 하나뿐이면 그 길이 막힐 때 방송이 멈춘다.
    ///
    /// 시그널링은 **이미 있는 WS** 를 쓴다(`w|...`). 서버를 하나 더 세우지 않는다.
    /// </summary>
    [ExecuteAlways]
    [AddComponentMenu("Handheld/Handheld WebRTC")]
    public sealed class HandheldWebRtc : MonoBehaviour
    {
        [Header("연결")]
        public HandheldServer server;

        [Tooltip("끄면 MJPEG 만 쓴다 (Edit 모드에서는 어차피 영상 트랙이 안 돈다).")]
        public bool enableWebRtc = true;

        [Tooltip("영상 비트레이트 상한 (kbps). 방송 업링크를 얼마나 내줄지 = 이 값.")]
        [Range(200, 20000)] public int maxBitrateKbps = 2500;

        [Tooltip("영상을 실어 보낼 RenderTexture. 비우면 리그의 뷰파인더 RT 를 쓴다.")]
        public HandheldRig rig;

        RTCPeerConnection _pc;
        RTCDataChannel _poseChannel;
        MediaStreamTrack _videoTrack;
        Coroutine _pump;

        /// <summary>지금 WebRTC 로 붙어 있나 = 영상·포즈가 그리로 흐르나.</summary>
        public bool Connected =>
            _pc != null && _pc.ConnectionState == RTCPeerConnectionState.Connected;

        /// <summary>데이터채널이 열려 포즈가 그리로 오나.</summary>
        public bool PoseChannelOpen =>
            _poseChannel != null && _poseChannel.ReadyState == RTCDataChannelState.Open;

        /// <summary>조종석 한 줄.</summary>
        public string StatusLine =>
            !enableWebRtc ? "꺼짐 — MJPEG 만"
            : _pc == null ? "대기 (폰이 열자고 해야 시작한다)"
            : $"{_pc.ConnectionState} · 포즈채널 {(PoseChannelOpen ? "열림" : "닫힘")}"
              + $" · 영상 {(_videoTrack != null ? "붙음" : "없음")}"
              + (string.IsNullOrEmpty(LastError) ? "" : " · 마지막오류 " + LastError);

        // ★ 3.0.0 에는 `WebRTC.Initialize()` 가 없다 — 컴파일러가 알려 줬다.
        //   「초기화를 안 불러서 던진다」는 내 짐작이 틀렸다는 뜻이다.
        //   그래서 짐작으로 고치지 않고, **마지막 예외를 밖에서 읽게** 남긴다(/diag).
        public static string LastError = "";

        void OnDisable() => Close();

        // ── 바깥에서 부르는 것 ───────────────────────────────────────────────────

        /// <summary>
        /// 폰이 보낸 시그널링 한 줄을 처리한다. `w|offer|<sdp>` · `w|ice|<candidate>|<mid>|<index>`.
        /// **수신 스레드에서 불린다** — 여기서 WebRTC 를 만지면 안 되므로 큐에만 넣는다.
        /// </summary>
        public void EnqueueSignal(string msg)
        {
            lock (_signalLock) _signals.Enqueue(msg);
        }

        readonly object _signalLock = new object();
        readonly Queue<string> _signals = new Queue<string>();

        /// <summary>
        /// 조종석·리그가 매 틱 부른다. 시그널링을 처리하고 콜백 큐를 비운다.
        /// `WebRTC.ExecutePendingTasks` 는 코루틴이 아니라 Edit 모드에서도 돈다 —
        /// 데이터채널만 쓸 때는 Play 가 필요 없다.
        /// </summary>
        public void Tick()
        {
            if (!enableWebRtc) return;

            // ★ **편집 모드에서는 아예 안 돈다** (2026-08-21 실측으로 정함).
            //   영상 트랙이 Play 를 요구하므로 편집 모드에서 얻는 건 데이터채널뿐인데,
            //   그 이득은 작다(TCP 는 전이중이라 포즈가 영상 뒤에 안 선다).
            //   반면 편집 모드에서 이걸 돌리다 던지면 **리그까지 같이 죽었다** —
            //   실제로 그래서 화면이 검었다. 편집 모드는 알던 길(MJPEG+WS)로 둔다.
            if (!Application.isPlaying) return;



            string msg = null;
            for (;;)
            {
                lock (_signalLock) { if (_signals.Count == 0) break; msg = _signals.Dequeue(); }
                try { HandleSignal(msg); }
                catch (Exception e)
                {
                    LastError = "signal: " + e.GetType().Name + " " + e.Message;
                    Debug.LogWarning("[Handheld] 시그널 처리 실패: " + e.Message);
                }
            }

            try { WebRTC.ExecutePendingTasks(2); }
            catch (Exception e) { LastError = "pump: " + e.GetType().Name + " " + e.Message; }
        }

        public void Close()
        {
            if (_pump != null && Application.isPlaying) { StopCoroutine(_pump); }
            _pump = null;
            try { _poseChannel?.Close(); } catch { }
            try { _videoTrack?.Dispose(); } catch { }
            try { if (rig != null) rig.ReleaseWebRtcTexture(); } catch { }
            try { _pc?.Close(); _pc?.Dispose(); } catch { }
            _poseChannel = null;
            _videoTrack = null;
            _pc = null;
        }

        // ── 시그널링 ─────────────────────────────────────────────────────────────
        void HandleSignal(string msg)
        {
            // w|offer|<sdp>
            if (msg.StartsWith("w|offer|", StringComparison.Ordinal))
            {
                string sdp = msg.Substring("w|offer|".Length);
                StartCoroutineSafe(Answer(sdp));
                return;
            }

            // w|ice|<candidate>|<sdpMid>|<sdpMLineIndex>
            if (msg.StartsWith("w|ice|", StringComparison.Ordinal))
            {
                var parts = msg.Split('|');
                if (parts.Length < 5 || _pc == null) return;
                var init = new RTCIceCandidateInit
                {
                    candidate = parts[2],
                    sdpMid = parts[3],
                    sdpMLineIndex = int.TryParse(parts[4], out int mi) ? mi : 0,
                };
                _pc.AddIceCandidate(new RTCIceCandidate(init));
                return;
            }

            if (msg == "w|bye") { Close(); return; }
        }

        IEnumerator Answer(string offerSdp)
        {
            Close();                                    // 새 제안이 오면 앞 연결은 접는다

            var config = new RTCConfiguration
            {
                // STUN 하나면 같은 망·대부분의 가정용 NAT 를 넘는다. TURN 은 여기 안 둔다 —
                // 중계가 필요한 망이면 어차피 MJPEG(터널) 이 더 단순한 길이다.
                iceServers = new[] { new RTCIceServer { urls = new[] { "stun:stun.l.google.com:19302" } } },
            };
            _pc = new RTCPeerConnection(ref config);

            _pc.OnIceCandidate = c =>
            {
                server?.SendText($"w|ice|{c.Candidate}|{c.SdpMid}|{c.SdpMLineIndex}");
            };
            _pc.OnConnectionStateChange = s => Debug.Log($"[Handheld] WebRTC {s}");

            // 폰이 만든 데이터채널을 받는다 (포즈·스틱·렌즈가 이리로 온다)
            _pc.OnDataChannel = ch =>
            {
                _poseChannel = ch;
                ch.OnMessage = bytes =>
                {
                    // 규약은 WS 와 **똑같다** — 서버의 파서를 그대로 쓴다.
                    // 길이 두 벌을 유지하면 반드시 갈라진다.
                    server?.OnPhoneText(System.Text.Encoding.UTF8.GetString(bytes));
                };
                Debug.Log("[Handheld] 포즈 데이터채널 열림");
            };

            // ── 영상 트랙 ────────────────────────────────────────────────────
            // 캡처 경로를 새로 짜지 않는다 — 리그가 이미 만든 뷰파인더 RT 를 그대로 싣는다.
            // 16:9 고정·해상도 손잡이·게이트 핏이 전부 그대로 산다.
            //
            // Play 모드에서만 흐른다. `WebRTC.Update()` 가 `WaitForEndOfFrame` 을 기다리는데
            // Edit 모드엔 그 신호가 없기 때문이다. Edit 모드에서는 데이터채널만 살고
            // 영상은 MJPEG 이 계속 나른다 — 그래서 화면이 끊기지 않는다.
            if (Application.isPlaying)
            {
                if (rig == null) rig = GetComponent<HandheldRig>() ?? FindAnyObjectByType<HandheldRig>();
                // 뷰파인더 그림을 BGRA 로 한 벌 받아 온다 (포맷이 서로 안 맞아 갈라 둔 것).
                RenderTexture source = rig != null ? rig.WebRtcTexture() : null;
                if (source != null)
                {
                    _videoTrack = new VideoStreamTrack(source);
                    _pc.AddTrack(_videoTrack);
                    _pump = StartCoroutine(WebRTC.Update());
                }
                else Debug.LogWarning("[Handheld] 뷰파인더 RT 가 아직 없다 — 영상 없이 데이터채널만 연다.");
            }

            var remote = new RTCSessionDescription { type = RTCSdpType.Offer, sdp = offerSdp };
            var setRemote = _pc.SetRemoteDescription(ref remote);
            yield return setRemote;
            if (setRemote.IsError) { Debug.LogError("[Handheld] offer 실패: " + setRemote.Error.message); yield break; }

            var answer = _pc.CreateAnswer();
            yield return answer;
            if (answer.IsError) { Debug.LogError("[Handheld] answer 실패: " + answer.Error.message); yield break; }

            var local = answer.Desc;
            var setLocal = _pc.SetLocalDescription(ref local);
            yield return setLocal;
            if (setLocal.IsError) { Debug.LogError("[Handheld] answer 적용 실패: " + setLocal.Error.message); yield break; }

            server?.SendText("w|answer|" + local.sdp);

            // 비트레이트 상한 — **방송 업링크를 얼마나 내줄지가 이 한 줄이다.**
            // 안 걸면 혼잡제어가 회선을 다 쓰려 들고, 그 회선은 OBS 송출과 같은 것이다.
            ApplyBitrateCap();
        }

        void ApplyBitrateCap()
        {
            if (_pc == null) return;
            foreach (var sender in _pc.GetSenders())
            {
                if (sender.Track == null || sender.Track.Kind != TrackKind.Video) continue;
                var param = sender.GetParameters();
                if (param.encodings == null) continue;
                foreach (var enc in param.encodings)
                    enc.maxBitrate = (ulong)Mathf.Clamp(maxBitrateKbps, 200, 20000) * 1000UL;
                var err = sender.SetParameters(param);
                if (err.errorType != RTCErrorType.None)
                    Debug.LogWarning("[Handheld] 비트레이트 상한 실패: " + err.message);
                else
                    Debug.Log($"[Handheld] 영상 상한 {maxBitrateKbps} kbps");
            }
        }

        /// <summary>
        /// Edit 모드에는 코루틴이 없다 — 그때는 끝까지 손으로 돌린다.
        /// (영상 트랙은 어차피 Play 를 요구하므로 Edit 모드에서 도는 건 데이터채널뿐이다.)
        /// </summary>
        void StartCoroutineSafe(IEnumerator routine)
        {
            if (Application.isPlaying) { StartCoroutine(routine); return; }
            while (true)
            {
                bool moved;
                try { moved = routine.MoveNext(); }
                catch (Exception e) { Debug.LogWarning("[Handheld] 시그널 코루틴 실패: " + e.Message); return; }
                if (!moved) return;
                // yield 된 것이 WebRTC 비동기 작업이면 끝날 때까지 펌프한다.
                if (routine.Current is AsyncOperationBase op)
                {
                    int guard = 0;
                    while (!op.IsDone && guard++ < 2000) { WebRTC.ExecutePendingTasks(2); }
                }
            }
        }
    }
}
