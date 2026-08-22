using UnityEngine;

namespace Handheld
{
    /// <summary>
    /// 오일러 각을 **끊기지 않게** 이어 내준다 — 359° 다음이 361° 이지 1° 가 아니다.
    ///
    /// 왜 필요한가: 카메라를 받아 쓰는 쪽은 자세를 사원수가 아니라 **오일러 세 개로 들고
    /// 보간하는 경우가 흔하다**(`Mathf.Lerp(pitch, target.pitch, t)` 같은 꼴). 그 보간은
    /// 최단 경로를 모른다. 우리가 [0,360) 로 감긴 값을 주면 359 → 1 을 건널 때 **반대로
    /// 358° 를 돌아간다** — 생방에서 카메라가 한 바퀴 도는 사고다.
    ///
    /// 사원수로 받는 쪽은 이 문제가 없다(Slerp 가 알아서 짧은 쪽으로 간다). 그래도 오일러를
    /// 원하는 쪽이 있으므로 **우리가 이어서 내주는 것**이 맞다 — 받는 쪽마다 고치라고 할 수 없다.
    /// </summary>
    public struct ContinuousEuler
    {
        Vector3 _last;
        bool _has;

        /// <summary>기준을 버린다 (리센터·재정위처럼 이어 붙일 근거가 사라졌을 때).</summary>
        public void Reset() => _has = false;

        /// <summary>
        /// 감긴 오일러 각을 앞 값에 이어 붙여 내준다.
        /// 한 걸음에 180° 넘게 움직이는 일은 사람 손으로는 없으므로, 그보다 큰 차이는
        /// 「감겼다」로 본다.
        /// </summary>
        public Vector3 Advance(Vector3 wrapped)
        {
            if (!_has)
            {
                _last = wrapped;
                _has = true;
                return _last;
            }

            _last = new Vector3(
                _last.x + Mathf.DeltaAngle(_last.x, wrapped.x),
                _last.y + Mathf.DeltaAngle(_last.y, wrapped.y),
                _last.z + Mathf.DeltaAngle(_last.z, wrapped.z));
            return _last;
        }
    }
}
