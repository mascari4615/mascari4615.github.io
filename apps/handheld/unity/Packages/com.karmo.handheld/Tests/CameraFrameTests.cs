using NUnit.Framework;
using UnityEngine;

namespace Handheld.Tests
{
    /// <summary>
    /// 호스트 앱에 넘기는 창구의 약속. 여기서 어긋나면 받는 쪽 화면에서만 티가 나고
    /// 우리 쪽은 아무 오류도 안 낸다 — 그래서 못을 박는다.
    /// </summary>
    public class CameraFrameTests
    {
        static readonly Quaternion[] Poses =
        {
            Quaternion.identity,
            Quaternion.Euler(0f, 179f, 0f),
            Quaternion.Euler(35f, -95f, 12f),
            Quaternion.Euler(-62f, 271f, -140f),
            Quaternion.Euler(89f, 44f, 3f),
        };

        [Test]
        public void 오일러로_되돌리면_같은_자세다()
        {
            // 받는 쪽이 오일러 세 개만 들고 `Quaternion.Euler(pitch, yaw, roll)` 로 되돌리는
            // 일이 흔하다. 우리가 내주는 오일러가 그 식의 역이 아니면 자세가 어긋난다.
            foreach (var q in Poses)
            {
                Vector3 e = q.eulerAngles;
                var back = Quaternion.Euler(e.x, e.y, e.z);
                Assert.Less(Quaternion.Angle(q, back), 0.01f, "오일러 왕복이 어긋난다");
            }
        }

        [Test]
        public void 축분해도_같은_식의_역이다()
        {
            // AxisLock 이 쓰는 가르기·붙이기도 `Quaternion.Euler` 와 같은 규약이어야 한다.
            // 다르면 축 잠금을 켠 순간 받는 쪽 자세가 홱 돈다.
            foreach (var q in Poses)
            {
                AxisLock.Decompose(q, out float yaw, out float pitch, out float roll);
                var mine = AxisLock.Compose(yaw, pitch, roll);
                var unity = Quaternion.Euler(pitch, yaw, roll);
                Assert.Less(Quaternion.Angle(mine, unity), 0.01f,
                    $"규약이 다르다 (요 {yaw:F1} 피치 {pitch:F1} 롤 {roll:F1})");
            }
        }

        [Test]
        public void 오일러는_감기지_않는다()
        {
            // 받는 쪽이 오일러를 그냥 Lerp 하면 최단 경로를 모른다. 359 -> 1 을 주면
            // 358° 를 반대로 돈다 — 생방에서 카메라가 한 바퀴 도는 사고다.
            var e = new ContinuousEuler();
            float[] wrapped = { 350f, 355f, 359f, 3f, 8f, 359f, 350f };
            float[] expect = { 350f, 355f, 359f, 363f, 368f, 359f, 350f };

            for (int i = 0; i < wrapped.Length; i++)
            {
                float got = e.Advance(new Vector3(0f, wrapped[i], 0f)).y;
                Assert.AreEqual(expect[i], got, 0.01f, $"{i}번째에서 감겼다");
            }

            // 한 걸음씩의 차이가 절대 180 을 안 넘어야 한다 = 최단 경로로만 움직였다.
            for (int i = 1; i < expect.Length; i++)
                Assert.Less(Mathf.Abs(expect[i] - expect[i - 1]), 180f);
        }

        [Test]
        public void 이어_붙인_오일러도_같은_자세를_가리킨다()
        {
            // 감기지 않게 만들다가 자세 자체가 틀어지면 최악이다. 360 을 더해도
            // `Quaternion.Euler` 는 같은 자세여야 한다.
            var e = new ContinuousEuler();
            foreach (var q in Poses)
            {
                Vector3 cont = e.Advance(q.eulerAngles);
                var back = Quaternion.Euler(cont.x, cont.y, cont.z);
                Assert.Less(Quaternion.Angle(q, back), 0.01f, "이어 붙이다 자세가 틀어졌다");
            }
        }

        [Test]
        public void 기준을_버리면_다시_감긴_값에서_시작한다()
        {
            var e = new ContinuousEuler();
            e.Advance(new Vector3(0f, 350f, 0f));
            e.Advance(new Vector3(0f, 10f, 0f));      // 370 이 된다
            e.Reset();
            Assert.AreEqual(10f, e.Advance(new Vector3(0f, 10f, 0f)).y, 0.01f);
        }

        [Test]
        public void 렌즈가_흔한_범위를_벗어나면_알린다()
        {
            // 받는 쪽은 대개 좁게 자른다 — 벗어나면 조용히 잘려 렌즈가 안 따라온다.
            var ok = new HandheldCameraFrame
            {
                FovY = 45f, FocalLengthMm = 50f, Aperture = 2.8f, FocusDistanceM = 3f,
            };
            Assert.IsTrue(ok.LensInCommonRange);
            Assert.IsEmpty(ok.LensOutOfRange());

            var tooFar = ok; tooFar.FocalLengthMm = 900f;
            Assert.IsFalse(tooFar.LensInCommonRange);
            StringAssert.Contains("초점거리", tooFar.LensOutOfRange());

            var tooOpen = ok; tooOpen.Aperture = 0.7f;
            Assert.IsFalse(tooOpen.LensInCommonRange);
            StringAssert.Contains("조리개", tooOpen.LensOutOfRange());

            var tooDeep = ok; tooDeep.FocusDistanceM = 180f;
            Assert.IsFalse(tooDeep.LensInCommonRange);
            StringAssert.Contains("초점", tooDeep.LensOutOfRange());
        }
    }
}
