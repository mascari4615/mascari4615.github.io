using System;
using System.Net;
using System.Net.Sockets;
using UnityEngine;

namespace Handheld
{
    /// <summary>
    /// 손카메라의 자세·화각을 **VMC Protocol** 로 내보낸다 — 받는 쪽이 우리 코드가 아니어도 된다.
    ///
    /// `/VMC/Ext/Cam` 이 나르는 렌즈 값은 fov 하나뿐이라, 초점거리·초점·조리개는 곁가지
    /// 주소(`/karmo/Ext/Lens`)로 같이 보낸다. 모르는 주소는 받는 쪽이 그냥 버리므로
    /// 표준을 안 깨뜨린다 — 우리 앱이면 그 칸까지 살고, 남의 앱이면 fov 만 산다.
    ///
    /// 규약·포트·좌표계: `Documentation~/vmc.md`.
    /// </summary>
    [AddComponentMenu("Handheld/VMC Camera Sender")]
    public sealed class VmcCameraSender : MonoBehaviour
    {
        [Tooltip("손카메라 리그. 있으면 렌즈 값(초점거리·초점·조리개)까지 같이 보낸다.")]
        public HandheldRig rig;

        [Tooltip("리그 없이 아무 카메라나 실어 보낼 때. 리그가 있으면 무시된다. " +
                 "비우면 이 오브젝트의 Camera 를 쓴다.")]
        public Camera sourceCamera;

        [Tooltip("받는 쪽(Marionette) 주소. 같은 PC 면 127.0.0.1.")]
        public string host = "127.0.0.1";

        [Tooltip("VMC 수신 기본 포트는 39539 다.")]
        public int port = 39539;

        [Tooltip("받는 쪽에서 이 카메라를 부르는 이름.")]
        public string cameraName = "Handheld";

        [Tooltip("초당 몇 번 보낼지. 포즈가 오는 만큼(30~60Hz)이면 충분하다.")]
        [Range(1, 120)] public int sendHz = 60;

        [Tooltip("초점거리·초점·조리개를 곁가지 주소로 같이 보낸다. 받는 쪽이 우리 앱일 때만 쓰인다.")]
        public bool sendLensExtras = true;

        UdpClient _udp;
        IPEndPoint _to;
        readonly OscWriter _osc = new OscWriter(256);
        float _nextSend;
        float _t0;

        /// <summary>마지막 오류 — 조종석·진단에 띄운다. 빈 문자열이면 멀쩡하다.</summary>
        public string LastError { get; private set; } = "";

        /// <summary>지금까지 보낸 통 수.</summary>
        public int SentCount { get; private set; }

        void OnEnable()
        {
            if (rig == null && sourceCamera == null)
            {
                sourceCamera = GetComponent<Camera>();
                if (sourceCamera == null) rig = FindAnyObjectByType<HandheldRig>();
            }
            _t0 = Time.realtimeSinceStartup;
            Open();
        }

        void OnDisable() => Close();

        void Open()
        {
            Close();
            try
            {
                _to = new IPEndPoint(IPAddress.Parse(host), Mathf.Clamp(port, 1, 65535));
                _udp = new UdpClient();
                LastError = "";
            }
            catch (Exception e)
            {
                LastError = e.Message;
                _udp = null;
            }
        }

        void Close()
        {
            try { _udp?.Close(); } catch { }
            _udp = null;
        }

        /// <summary>자세를 실어 보낼 대상. 리그가 우선이고, 없으면 그냥 카메라.</summary>
        Transform Source => rig != null ? rig.transform : (sourceCamera != null ? sourceCamera.transform : null);

        float SourceFovY => rig != null ? rig.FovY : (sourceCamera != null ? sourceCamera.fieldOfView : 0f);

        void Update()
        {
            var src = Source;
            if (_udp == null || src == null) return;

            float now = Time.realtimeSinceStartup;
            if (now < _nextSend) return;
            _nextSend = now + 1f / Mathf.Max(1, sendHz);

            // 하트비트 — 받는 쪽이 「아직 살아 있나」를 이걸로 본다.
            Send(_osc.Begin("/VMC/Ext/T", "f").Float(now - _t0));

            Vector3 p = src.position;
            Quaternion q = src.rotation;
            Send(_osc.Begin("/VMC/Ext/Cam", "sffffffff")
                .String(cameraName)
                .Float(p.x).Float(p.y).Float(p.z)
                .Float(q.x).Float(q.y).Float(q.z).Float(q.w)
                .Float(SourceFovY));

            // 곁가지는 리그가 있을 때만 — 그냥 카메라에는 실을 렌즈 값이 없다.
            if (!sendLensExtras || rig == null) return;

            // 곁가지: 표준이 안 나르는 렌즈 값. 주소를 모르면 그냥 버려진다.
            var f = rig.CameraFrame;
            Send(_osc.Begin("/karmo/Ext/Lens", "sfffff")
                .String(cameraName)
                .Float(f.Zoom)
                .Float(f.FocalLengthMm)
                .Float(f.FocusDistanceM)
                .Float(f.Aperture)
                .Float(f.SensorWidthMm));
        }

        void Send(OscWriter w)
        {
            try
            {
                _udp.Send(w.Buffer, w.Length, _to);
                SentCount++;
                if (LastError.Length > 0) LastError = "";
            }
            catch (Exception e)
            {
                // UDP 는 받는 쪽이 없어도 보통 안 던진다 — 던졌으면 진짜 문제다.
                LastError = e.Message;
            }
        }
    }
}
