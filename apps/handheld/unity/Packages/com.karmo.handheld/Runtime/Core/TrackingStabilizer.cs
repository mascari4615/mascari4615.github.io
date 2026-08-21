using UnityEngine;

namespace Handheld
{
    /// <summary>
    /// 폰이 보낸 자세에서 **추적 불연속**(ARCore 재정위)을 걷어내고 이어진 좌표를 내준다.
    ///
    /// 튄 만큼 원점을 옮겨 결과가 이어지게 한다 — 상한을 걸어 누르는 것과 다르다.
    /// 정보를 안 버리므로 그 뒤의 움직임은 그대로 살아난다.
    ///
    /// 왜 이게 필요한지, 문턱을 어디서 가져왔는지, 피치·롤을 왜 안 건드리는지는
    /// **`Documentation~/tracking.md`** 에 실측과 함께 있다. 여기선 손대지 말 것 두 가지만:
    ///   · 문턱은 「사람이 낼 수 있는 값」이다. 화면을 보고 조정하지 마라.
    ///   · 피치·롤은 중력 기준 참값이라 이어 붙이면 수평이 영구히 기운다.
    /// </summary>
    public sealed class TrackingStabilizer
    {
        /// <summary>이만큼 비면 그 사이 좌표계가 그대로였다고 못 믿는다 (정상 간격 30~40ms).</summary>
        public double maxGapMs = 250;

        /// <summary>사람이 카메라를 들고 낼 수 있는 속도의 위 (빠른 걸음 3m/s 안팎).</summary>
        public float maxSpeed = 5f;

        /// <summary>손목 스냅이 700~900°/s. 그 위는 사람이 아니다.</summary>
        public float maxAngularSpeed = 1000f;

        /// <summary>좌표계를 다시 맞춘 횟수 — 진단에 띄운다(잦으면 추적이 나쁜 것).</summary>
        public int ReanchorCount { get; private set; }

        /// <summary>마지막으로 다시 맞춘 이유 (진단용).</summary>
        public string LastReason { get; private set; } = "";

        /// <summary>마지막으로 다시 맞춘 때 (Time.realtimeSinceStartup 아님 — 폰 시각).</summary>
        public double LastReanchorPhoneTime { get; private set; } = -1;

        /// <summary>
        /// 방금 좌표계를 다시 맞췄다 — 리그가 한 번 집어 간다(집으면 내려간다).
        /// 남은 기울기(피치·롤)를 리그가 보간으로 밀어 넣으라는 신호다.
        /// </summary>
        public bool ConsumeReanchored()
        {
            bool v = JustReanchored;
            JustReanchored = false;
            return v;
        }

        /// <summary>집어 가기 전까지 서 있는 깃발.</summary>
        public bool JustReanchored { get; private set; }

        /// <summary>
        /// 밖에서 온 **확정 통보** — 다음 표본에서 무조건 좌표계를 다시 맞춘다.
        /// 폰의 WebXR 기준 공간이 `reset` 을 쏘면 그게 재정위의 정답이다. 공백·속도
        /// 판정은 그 통보를 못 받는 경우(화면이 꺼져 rAF 가 멈춘 사이)를 위한 그물로 남는다.
        /// </summary>
        public void NotifyReset(string why = "폰이 원점 재설정을 알렸다") => _pendingReset = why;

        string _pendingReset;

        // 지금까지 쌓인 좌표계 보정 — 결과 = Ry(-_yaw) * (원본 - _offset)
        Vector3 _offset;
        float _yaw;

        // 앞 표본 (원본과 결과 둘 다 필요하다 — 결과를 이어 붙이려면 앞의 결과를 알아야 한다)
        Vector3 _prevRaw, _prevOut;
        Quaternion _prevRawRot = Quaternion.identity;
        double _prevPhoneTime;
        bool _has;

        /// <summary>폰이 끊겼다 — 다음 연결은 새 좌표계다.</summary>
        public void Reset()
        {
            _offset = Vector3.zero;
            _yaw = 0f;
            _has = false;
            JustReanchored = false;
            _pendingReset = null;
            LastReason = "";
        }

        /// <summary>
        /// 원본 포즈를 이어진 좌표로 바꾼다. 불연속이면 원점을 다시 맞춰
        /// **결과가 앞 표본 그대로** 이어지게 한다.
        /// </summary>
        /// <returns>이번에 좌표계를 다시 맞췄으면 true.</returns>
        public bool Stabilize(double phoneTimeMs, Vector3 rawPos, Quaternion rawRot,
                              out Vector3 outPos, out Quaternion outRot)
        {
            bool reanchored = false;

            if (_has)
            {
                string reason = Discontinuity(phoneTimeMs, rawPos, rawRot);
                if (reason != null)
                {
                    // 요만 이어 붙인다 — 피치·롤은 중력 기준이라 원본을 그대로 쓴다.
                    _yaw += TwistAboutUp(rawRot * Quaternion.Inverse(_prevRawRot));
                    // 새 원본이 **앞의 결과**로 떨어지도록 원점을 옮긴다.
                    _offset = rawPos - Quaternion.Euler(0f, _yaw, 0f) * _prevOut;

                    ReanchorCount++;
                    JustReanchored = true;
                    LastReason = reason;
                    LastReanchorPhoneTime = phoneTimeMs;
                    reanchored = true;
                }
            }

            Quaternion yawInv = Quaternion.Euler(0f, -_yaw, 0f);
            outPos = yawInv * (rawPos - _offset);
            outRot = yawInv * rawRot;

            _prevRaw = rawPos;
            _prevRawRot = rawRot;
            _prevOut = outPos;
            _prevPhoneTime = phoneTimeMs;
            _has = true;
            return reanchored;
        }

        /// <summary>불연속이면 사유 문자열, 아니면 null.</summary>
        string Discontinuity(double phoneTimeMs, Vector3 rawPos, Quaternion rawRot)
        {
            if (_pendingReset != null)
            {
                string why = _pendingReset;
                _pendingReset = null;
                return why;
            }

            double gap = phoneTimeMs - _prevPhoneTime;

            // 폰 시각이 멈췄거나 뒤로 갔다 = 세션이 다시 시작됐다.
            if (gap <= 0) return $"폰 시각 역행 ({gap:F0}ms)";
            if (gap > maxGapMs) return $"프레임 공백 {gap:F0}ms";

            float dt = (float)(gap / 1000.0);
            float speed = Vector3.Distance(rawPos, _prevRaw) / dt;
            if (speed > maxSpeed) return $"불가능한 속도 {speed:F1}m/s";

            float angSpeed = Quaternion.Angle(_prevRawRot, rawRot) / dt;
            if (angSpeed > maxAngularSpeed) return $"불가능한 각속도 {angSpeed:F0}°/s";

            return null;
        }

        /// <summary>
        /// 두 자세 사이의 회전 중 **수직축을 도는 몫**만 (스윙-트위스트의 트위스트).
        /// 요 각도를 각각 재서 빼면 바닥·천장을 겨눌 때 작은 회전이 173° 로 읽힌다 —
        /// 그래서 요 각도 자체는 어디에도 안 쓴다. 근거: `Documentation~/tracking.md`.
        /// </summary>
        public static float TwistAboutUp(Quaternion delta)
        {
            // (0, y, 0, w) 를 정규화하면 수직축을 도는 회전만 남는다.
            float y = delta.y, w = delta.w;
            float n = Mathf.Sqrt(y * y + w * w);
            if (n < 1e-6f) return 180f;              // 수직축으로 반 바퀴 — 부호는 무의미
            float ang = 2f * Mathf.Atan2(y / n, w / n) * Mathf.Rad2Deg;
            while (ang > 180f) ang -= 360f;
            while (ang < -180f) ang += 360f;
            return ang;
        }
    }
}
