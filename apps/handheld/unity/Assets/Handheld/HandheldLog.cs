using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEngine;

namespace Handheld
{
    /// <summary>
    /// 포즈를 단계별로 CSV 에 적는다 — 「좌우 회전이 튄다 / 저 혼자 움직인다」가
    /// **폰에서 오는지 유니티에서 생기는지**를 가르려고 있다. TASK-KAR-230.
    ///
    /// 세 지점을 같은 순번(seq)으로 묶어 적는다:
    ///   raw    = 폰이 보낸 줄 그대로 (WebXR 원본, 우리가 손대기 전)
    ///   conv   = Unity 좌표계로 옮긴 뒤 (부호만 바뀐 순수 변환)
    ///   shown  = 리센터·보간까지 먹인 뒤 (실제로 카메라가 선 자리)
    ///
    /// raw 에서 이미 튀면 ARCore/폰, shown 에서만 튀면 우리 코드다.
    /// 쓰기는 파일 스레드에서만 한다 — 소켓·메인 스레드를 막지 않는다.
    /// </summary>
    public sealed class HandheldLog : IDisposable
    {
        readonly ConcurrentQueue<string> _poseRows = new ConcurrentQueue<string>();
        readonly ConcurrentQueue<string> _shownRows = new ConcurrentQueue<string>();
        readonly string _poseePath, _shownPath;
        readonly DateTime _t0 = DateTime.UtcNow;

        StreamWriter _poseWriter, _shownWriter;
        volatile bool _disposed;

        public string Folder { get; }
        public int PoseRows { get; private set; }
        public int ShownRows { get; private set; }

        public HandheldLog(string folder)
        {
            Folder = folder;
            Directory.CreateDirectory(folder);
            string stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
            _poseePath = Path.Combine(folder, $"pose-{stamp}.csv");
            _shownPath = Path.Combine(folder, $"shown-{stamp}.csv");

            _poseWriter = new StreamWriter(_poseePath, false, new UTF8Encoding(false));
            _poseWriter.WriteLine("t_ms,seq,phone_t,raw_px,raw_py,raw_pz,raw_qx,raw_qy,raw_qz,raw_qw,fov,aspect,dof," +
                                  "conv_px,conv_py,conv_pz,conv_qx,conv_qy,conv_qz,conv_qw," +
                                  "gap_ms,phone_gap_ms,jitter_ms,rtt_ms");
            _shownWriter = new StreamWriter(_shownPath, false, new UTF8Encoding(false));
            _shownWriter.WriteLine("t_ms,seq,shown_px,shown_py,shown_pz,shown_qx,shown_qy,shown_qz,shown_qw," +
                                   "cam_x,cam_y,cam_z,cam_yaw,stick_lx,stick_ly,stick_rx,stick_ry,recentered");
        }

        double NowMs => (DateTime.UtcNow - _t0).TotalMilliseconds;

        // 앞 줄과의 간격을 재려고 마지막 값을 들고 있는다.
        // Pose() 는 수신 스레드 **하나**에서만 불리므로 잠금이 필요 없다.
        double _lastArrivalMs = -1, _lastPhoneMs = -1;

        static string F(float v) => v.ToString("F6", CultureInfo.InvariantCulture);

        /// <summary>수신 스레드에서 호출 — 폰 원본과 변환 결과를 한 줄로.</summary>
        public void Pose(int seq, double phoneTime,
                         float rx, float ry, float rz, float rqx, float rqy, float rqz, float rqw,
                         float fov, float aspect, string dof,
                         Vector3 conv, Quaternion convRot, float rttMs)
        {
            if (_disposed) return;

            double now = NowMs;

            // **두 시계를 빼서 비교한다.** 폰 시계와 우리 시계는 원점도 걸음도 다르지만,
            // 각자의 *간격* 을 빼면 그 차이는 사라지고 「망이 만든 변동」만 남는다.
            // 첫 줄은 앞 줄이 없으므로 빈칸 — 0 을 적으면 「지터 0」으로 읽힌다.
            string gap = "", phoneGap = "", jitter = "";
            if (_lastArrivalMs >= 0)
            {
                double g = now - _lastArrivalMs;
                double pg = phoneTime - _lastPhoneMs;
                gap = g.ToString("F2", CultureInfo.InvariantCulture);
                phoneGap = pg.ToString("F2", CultureInfo.InvariantCulture);
                jitter = (g - pg).ToString("F2", CultureInfo.InvariantCulture);
            }
            _lastArrivalMs = now;
            _lastPhoneMs = phoneTime;

            // rtt 는 아직 한 번도 못 쟀으면 빈칸 (음수를 적으면 수치로 읽힌다)
            string rtt = rttMs >= 0f ? F(rttMs) : "";

            _poseRows.Enqueue(string.Join(",",
                now.ToString("F2", CultureInfo.InvariantCulture), seq.ToString(),
                phoneTime.ToString("F1", CultureInfo.InvariantCulture),
                F(rx), F(ry), F(rz), F(rqx), F(rqy), F(rqz), F(rqw),
                F(fov), F(aspect), dof,
                F(conv.x), F(conv.y), F(conv.z), F(convRot.x), F(convRot.y), F(convRot.z), F(convRot.w),
                gap, phoneGap, jitter, rtt));
        }

        /// <summary>메인(틱) 쪽에서 호출 — 보간·리센터를 먹인 결과.</summary>
        public void Shown(int seq, Vector3 shownPos, Quaternion shownRot,
                          Vector3 camPos, float camYaw, Vector4 stick, bool recentered)
        {
            if (_disposed) return;
            _shownRows.Enqueue(string.Join(",",
                NowMs.ToString("F2", CultureInfo.InvariantCulture), seq.ToString(),
                F(shownPos.x), F(shownPos.y), F(shownPos.z),
                F(shownRot.x), F(shownRot.y), F(shownRot.z), F(shownRot.w),
                F(camPos.x), F(camPos.y), F(camPos.z), F(camYaw),
                F(stick.x), F(stick.y), F(stick.z), F(stick.w),
                recentered ? "1" : "0"));
        }

        /// <summary>틱마다 불러 큐를 비운다 — 파일 I/O 를 소켓 스레드에서 떼어 놓는다.</summary>
        public void Flush()
        {
            if (_disposed) return;
            while (_poseRows.TryDequeue(out var row)) { _poseWriter.WriteLine(row); PoseRows++; }
            while (_shownRows.TryDequeue(out var row)) { _shownWriter.WriteLine(row); ShownRows++; }
        }

        public void Dispose()
        {
            if (_disposed) return;
            Flush();
            _disposed = true;
            try { _poseWriter?.Flush(); _poseWriter?.Dispose(); } catch { }
            try { _shownWriter?.Flush(); _shownWriter?.Dispose(); } catch { }
            _poseWriter = null;
            _shownWriter = null;
            Debug.Log($"[Handheld] 기록 끝 — 포즈 {PoseRows}줄 · 화면 {ShownRows}줄\n{_poseePath}");
        }
    }
}
