using System;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using UnityEngine;

namespace Handheld
{
    /// <summary>
    /// VMC 카메라 메시지를 받아 이 게임오브젝트의 카메라를 몬다.
    /// **손카메라가 다른 프로세스(또는 다른 PC)에서 돌 때** 쓰는 쪽이다.
    ///
    /// 받는 것: `/VMC/Ext/Cam` (자세 + fov) · `/karmo/Ext/Lens` (우리 곁가지 — 초점거리·초점·조리개).
    /// 곁가지를 모르는 앱이 보내면 그 칸만 안 오고 나머지는 그대로 돈다.
    ///
    /// 규약: `Documentation~/vmc.md`.
    /// </summary>
    [AddComponentMenu("Handheld/VMC Camera Receiver")]
    public sealed class VmcCameraReceiver : MonoBehaviour
    {
        [Tooltip("몰 카메라. 비우면 이 오브젝트의 Camera 를 쓴다.")]
        public Camera targetCamera;

        [Tooltip("VMC 수신 기본 포트는 39539 다.")]
        public int port = 39539;

        [Tooltip("이 이름의 카메라만 받는다. 비우면 아무 이름이나 받는다.")]
        public string cameraName = "Handheld";

        [Tooltip("fov 대신 물리 카메라(초점거리 mm)로 그린다 — 곁가지가 올 때만 뜻이 있다.")]
        public bool usePhysicalLens = true;

        UdpClient _udp;
        Thread _rx;
        volatile bool _running;

        // 수신 스레드가 쓰고 메인 스레드가 읽는다. 유니티 API 는 절대 수신 스레드에서 안 만진다.
        readonly object _lock = new object();
        Vector3 _pos;
        Quaternion _rot = Quaternion.identity;
        float _fov, _focalMm, _focusM, _aperture, _sensorMm, _zoom;
        bool _hasPose, _hasLens;

        /// <summary>마지막으로 받은 때 (Time.realtimeSinceStartup). 안 오면 안 갱신된다.</summary>
        public float LastReceivedAt { get; private set; } = -1f;

        /// <summary>받은 통 수 — 「오고 있나」를 이걸로 본다.</summary>
        public int ReceivedCount { get; private set; }

        public string LastError { get; private set; } = "";

        /// <summary>보내는 쪽이 알려 온 배율 — 그리는 데는 안 쓰고 조종석·진단에만 띄운다.</summary>
        public float Zoom => _zoom;

        void OnEnable()
        {
            if (targetCamera == null) targetCamera = GetComponent<Camera>();
            Application.runInBackground = true;      // 창이 뒤로 가도 계속 받아야 한다
            StartListening();
        }

        void OnDisable() => StopListening();

        void StartListening()
        {
            StopListening();
            try
            {
                _udp = new UdpClient(Mathf.Clamp(port, 1, 65535));
                _running = true;
                _rx = new Thread(ReceiveLoop) { IsBackground = true, Name = "VmcCameraReceiver" };
                _rx.Start();
                LastError = "";
            }
            catch (Exception e)
            {
                LastError = e.Message;
                _udp = null;
            }
        }

        void StopListening()
        {
            _running = false;
            try { _udp?.Close(); } catch { }
            _udp = null;
            _rx = null;
        }

        void ReceiveLoop()
        {
            var from = new IPEndPoint(IPAddress.Any, 0);
            while (_running)
            {
                byte[] data;
                try { data = _udp.Receive(ref from); }
                catch { if (_running) LastError = "수신 끊김"; return; }
                Parse(data, data.Length);
            }
        }

        /// <summary>
        /// 바이트 한 통을 뜯는다. 수신 스레드에서 불린다 — **유니티 API 금지**.
        /// 밖으로 열어 둔 이유: 소켓 없이 이 함수만 시험할 수 있어야 한다
        /// (잘린 통·남의 이름·모르는 주소를 넣어 보는 시험이 여기 걸린다).
        /// </summary>
        public void Parse(byte[] data, int length)
        {
            var r = new OscReader(data, length);
            if (!r.Ok) return;

            if (r.Address == "/VMC/Ext/Cam" && r.TypeTags == "sffffffff")
            {
                string name = r.String();
                float px = r.Float(), py = r.Float(), pz = r.Float();
                float qx = r.Float(), qy = r.Float(), qz = r.Float(), qw = r.Float();
                float fov = r.Float();
                if (!r.Ok || !Named(name)) return;

                lock (_lock)
                {
                    _pos = new Vector3(px, py, pz);
                    _rot = new Quaternion(qx, qy, qz, qw);
                    _fov = fov;
                    _hasPose = true;
                }
                return;
            }

            if (r.Address == "/karmo/Ext/Lens" && r.TypeTags == "sfffff")
            {
                string name = r.String();
                float zoom = r.Float();          // 그리는 데는 안 쓴다 — 진단용으로만 들고 있는다
                float focalMm = r.Float(), focusM = r.Float(), apertureF = r.Float(), sensorMm = r.Float();
                if (!r.Ok || !Named(name)) return;

                lock (_lock)
                {
                    _focalMm = focalMm;
                    _focusM = focusM;
                    _aperture = apertureF;
                    _sensorMm = sensorMm;
                    _zoom = zoom;
                    _hasLens = true;
                }
            }
        }

        bool Named(string name) => string.IsNullOrEmpty(cameraName) || cameraName == name;

        void Update()
        {
            bool pose, lens;
            Vector3 p;
            Quaternion q;
            float fov, focalMm, focusM, apertureF, sensorMm;

            lock (_lock)
            {
                pose = _hasPose; lens = _hasLens;
                p = _pos; q = _rot; fov = _fov;
                focalMm = _focalMm; focusM = _focusM; apertureF = _aperture; sensorMm = _sensorMm;
                _hasPose = false;
                _hasLens = false;
            }

            if (!pose && !lens) return;
            ReceivedCount++;
            LastReceivedAt = Time.realtimeSinceStartup;

            if (pose)
            {
                // 정규화 — 전선을 건너오며 어긋난 사원수를 그대로 쓰면 스케일이 샌다.
                if (q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w > 1e-6f)
                    transform.SetPositionAndRotation(p, Quaternion.Normalize(q));
                else
                    transform.position = p;

                if (targetCamera != null && fov > 0.1f && fov < 179f)
                    targetCamera.fieldOfView = fov;
            }

            if (lens && targetCamera != null && usePhysicalLens && focalMm > 0.01f)
            {
                targetCamera.usePhysicalProperties = true;
                if (sensorMm > 0.01f)
                    targetCamera.sensorSize = new Vector2(sensorMm, sensorMm / Mathf.Max(0.01f, targetCamera.aspect));
                targetCamera.focalLength = focalMm;
                if (focusM > 0.001f) targetCamera.focusDistance = focusM;
                if (apertureF > 0.01f) targetCamera.aperture = apertureF;
            }
        }
    }
}
