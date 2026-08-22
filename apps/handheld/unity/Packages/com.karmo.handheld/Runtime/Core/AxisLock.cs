using UnityEngine;

namespace Handheld
{
    /// <summary>
    /// 축을 잠근다 — 삼각대 헤드에서 손잡이 하나를 조이는 것과 같다.
    /// 크레인·달리 흉내에 쓴다 (Unity Live Capture 의 Tilt/Pan/Roll 스위치와 같은 자리).
    ///
    /// **오일러 각으로 풀지 않는다.** 카메라맨이 바닥이나 천장을 겨누면 오일러는 무너진다
    /// (짐벌) — 그건 흔한 일이라 거기서 화면이 튀면 안 된다. 대신 겨냥 방향(요·피치)과
    /// 굴림(롤)을 **벡터로** 갈라 재고, 잠긴 것만 붙들어 둔 값으로 갈아 끼운다.
    ///
    /// 롤 잠금은 곧 **수평 유지**다 — 손이 기울어도 지평선이 안 눕는다.
    /// </summary>
    public struct AxisLock
    {
        public bool lockPan;      // 좌우 (수직축 회전)
        public bool lockTilt;     // 상하 (올려보기·내려보기)
        public bool lockRoll;     // 굴림 (= 수평 유지)

        public bool Any => lockPan || lockTilt || lockRoll;

        // 잠근 순간의 값. 잠긴 동안 이 값을 계속 쓴다.
        float _heldYaw, _heldPitch, _heldRoll;
        bool _held;

        /// <summary>지금 자세를 붙들 기준으로 삼는다 (스위치를 켠 순간 · 리센터).</summary>
        public void Hold(Quaternion rot)
        {
            Decompose(rot, out _heldYaw, out _heldPitch, out _heldRoll);
            _held = true;
        }

        /// <summary>잠긴 축을 붙들어 둔 값으로 갈아 끼운 자세.</summary>
        public Quaternion Apply(Quaternion rot)
        {
            if (!Any) return rot;
            if (!_held) Hold(rot);

            Decompose(rot, out float yaw, out float pitch, out float roll);
            if (lockPan) yaw = _heldYaw;
            if (lockTilt) pitch = _heldPitch;
            if (lockRoll) roll = 0f;              // 굴림을 0 으로 = 수평
            return Compose(yaw, pitch, roll);
        }

        /// <summary>
        /// 자세를 겨냥(요·피치)과 굴림(롤)으로 가른다.
        ///
        /// 요·피치는 **앞 벡터**에서 바로 읽는다 — 정의가 흐려지는 자리가 없다.
        /// 롤은 「수평이었다면 위가 향했을 방향」과 실제 위 벡터 사이의 각이다.
        /// 정수리·발밑을 정확히 겨눌 때만 그 기준이 사라지는데, 그때는 0 으로 둔다
        /// (그 자세에서는 롤과 요가 같은 것이라 어차피 구분이 없다).
        /// </summary>
        public static void Decompose(Quaternion rot, out float yaw, out float pitch, out float roll)
        {
            Vector3 f = rot * Vector3.forward;
            Vector3 up = rot * Vector3.up;

            yaw = Mathf.Atan2(f.x, f.z) * Mathf.Rad2Deg;
            pitch = -Mathf.Asin(Mathf.Clamp(f.y, -1f, 1f)) * Mathf.Rad2Deg;   // 유니티는 아래가 +

            Vector3 levelUp = Vector3.up - f * Vector3.Dot(Vector3.up, f);
            roll = levelUp.sqrMagnitude < 1e-6f ? 0f : Vector3.SignedAngle(levelUp, up, f);
        }

        /// <summary>가른 것을 도로 붙인다. <see cref="Decompose"/> 의 역이다.</summary>
        public static Quaternion Compose(float yaw, float pitch, float roll)
        {
            // 요 → 피치 → 롤 순서. 이 순서라야 롤이 「카메라 자기 축」을 도는 굴림이 된다.
            return Quaternion.AngleAxis(yaw, Vector3.up)
                 * Quaternion.AngleAxis(pitch, Vector3.right)
                 * Quaternion.AngleAxis(roll, Vector3.forward);
        }
    }
}
