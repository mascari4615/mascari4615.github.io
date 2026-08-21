using UnityEngine;

namespace Handheld
{
    /// <summary>
    /// 폰이 보낸 포즈에서 **추적 불연속**을 걷어내고 이어진 좌표를 내준다.
    ///
    /// ── 왜 있나 (2026-08-21, 실기록 4건에서 확정) ────────────────────────────
    /// 「카메라가 저 혼자 흐른다」와 「화면이 튄다」는 **같은 사건**이었다. 실측:
    ///
    ///   기록      공백      이동     Δ요     Δ피치   Δ롤
    ///   220026    439ms    3.17m   110.3°    1.9°   -2.1°
    ///   215031   1840ms    1.27m  -132.1°  -11.1°    0.7°
    ///   215031   2963ms    1.46m    -8.3°   -8.8°  -74.9°
    ///   213355   3930ms    0.17m   -44.0°   12.3°   -2.9°
    ///   214821  15646ms    0.08m   -26.1°   -7.3°   -1.7°   (폰 시각이 뒤로 갔다)
    ///
    /// 가장 큰 위치 점프와 가장 큰 각도 튐이 **전부 같은 표본**이고, 전부 **긴 공백
    /// 바로 뒤 첫 표본**이다 — 기록 전체에서 공백은 0.1~0.6% 뿐인데. 즉 ARCore 가
    /// 추적을 놓쳤다 되찾으면서 **좌표 원점을 새로 잡은 것**(재정위)이다. 우리는 그
    /// 새 좌표를 「사용자가 3m 이동했다」로 믿고 성실히 따라갔다.
    ///
    /// 그러니 이건 눌러야 할 잡음이 아니라 **좌표계 변경**이다. 상한을 걸어 완충하면
    /// 증상만 늦춰지고(카메라는 여전히 그리로 흘러간다) 진짜 빠른 팬까지 먹는다.
    /// 여기서는 **튄 만큼 원점을 옮겨** 결과가 이어지게 한다 — 정보를 버리지 않고
    /// 좌표계만 다시 맞추는 것이라 그 뒤의 움직임은 그대로 살아난다.
    ///
    /// ── 무엇을 불연속으로 보나 ──────────────────────────────────────────────
    /// ① **공백** — 폰 시각으로 <see cref="maxGapMs"/> 넘게 비면, 그 사이 좌표계가
    ///    그대로였다고 보증할 수 없다. 정상 간격은 30~40ms 다(rAF ~30Hz).
    ///    방송에서는 「몇 초치 이동을 놓치는 것」보다 「생방 중 순간이동」이 훨씬 크다 —
    ///    어차피 그 몇 초는 영상도 멈춰 있었다.
    /// ② **사람이 못 내는 속도** — 공백이 정상인데도 위치가 <see cref="maxSpeed"/>,
    ///    각도가 <see cref="maxAngularSpeed"/> 를 넘으면 사람의 움직임이 아니다.
    ///    (실측: 공백 없이 30ms 에 0.28m = 9.4m/s 인 표본이 있었다.)
    /// ③ **폰 시각 역행** — 세션이 다시 시작됐다는 확실한 신호.
    ///
    /// 문턱은 「사람이 낼 수 있는 값」에서 왔다. 빠른 걸음이 3m/s 안팎, 손목 스냅이
    /// 700~900°/s 다. 실측된 정상 표본은 0.06m/s 수준이라 여유가 두 자릿수다 —
    /// 즉 진짜 움직임을 잡아먹지 않는다.
    ///
    /// ── 피치·롤은 왜 안 이어 붙이나 ─────────────────────────────────────────
    /// 요와 위치는 ARCore 가 임의로 잡은 값이라 우리가 원점을 옮겨도 **잃는 정보가 없다**.
    /// 피치·롤은 다르다 — 중력 기준의 참값이다. 억지로 이어 붙이면 그 뒤로 방송 내내
    /// 수평이 기울어진 채 남는다. 카메라에 그건 순간이동보다 나쁘다.
    ///
    /// 그래서 여기서는 **손대지 않고**, 대신 <see cref="JustReanchored"/> 로 「방금 좌표계가
    /// 바뀌었다」를 알린다. 리그는 그 신호를 받아 잠깐 보간을 늘려 기울기를 *이어 붙이지 않고
    /// 밀어 넣는다* — 참값으로는 가되 한 프레임에 가지 않는다. 실측에서 공백 뒤 남는 기울기는
    /// 최대 74° 였고(3초 공백), 그 사이 사람이 실제로 굴린 것과 구분되지 않는다.
    ///
    /// 잡음(공백 정상인데 10~25° 튐)은 여기서 안 만진다 — 그건 별개 모집단이고
    /// 리그의 보간이 이미 20회 → 3회로 줄이고 있다. 여기서까지 누르면 빠른 팬이 죽는다.
    /// </summary>
    public sealed class TrackingStabilizer
    {
        /// <summary>이만큼 비면 그 사이 좌표계가 그대로였다고 못 믿는다 (정상 간격 30~40ms).</summary>
        public double maxGapMs = 250;

        /// <summary>사람이 카메라를 들고 낼 수 있는 속도의 위 — 빠른 걸음이 3m/s 안팎이다.</summary>
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
        /// 위치·요는 여기서 이미 이어 붙였고, 남은 기울기(피치·롤)를 리그가 밀어 넣으라는 신호다.
        /// </summary>
        public bool ConsumeReanchored()
        {
            bool v = JustReanchored;
            JustReanchored = false;
            return v;
        }

        /// <summary>집어 가기 전까지 서 있는 깃발.</summary>
        public bool JustReanchored { get; private set; }

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
        /// 두 자세 사이의 회전 중 **수직축을 도는 몫**만 (스윙-트위스트 분해의 트위스트).
        ///
        /// 「요 각도를 각각 재서 뺀다」로 하면 안 된다 — 카메라가 바닥이나 천장을 겨누면
        /// (카메라맨에게 흔한 일이다) 요는 정의가 흐려져 작은 실제 회전이 173° 로 읽힌다.
        /// 실측에서 그 값이 나왔다. 반면 **상대 회전의 수직축 성분**은 자세가 어떻든
        /// 잘 정의된다 — 그래서 여기서만 재고, 요 각도 자체는 어디에도 안 쓴다.
        /// </summary>
        public static float TwistAboutUp(Quaternion delta)
        {
            // 수직축 성분만 남긴 사원수: (0, y, 0, w) 를 정규화하면 그 축을 도는 회전이다.
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
