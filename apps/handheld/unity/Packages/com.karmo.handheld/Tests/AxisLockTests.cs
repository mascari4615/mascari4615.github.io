using NUnit.Framework;
using UnityEngine;

namespace Handheld.Tests
{
    /// <summary>
    /// 축 잠금. 제일 중요한 것은 **안 잠근 축은 손도 대지 않는다**는 것 —
    /// 가르고 도로 붙이는 과정에서 조금씩 어긋나면 방송 내내 화면이 미세하게 뒤틀린다.
    /// 그래서 왕복(가르기→붙이기)이 원래 자세와 같은지부터 잰다.
    /// </summary>
    public class AxisLockTests
    {
        static float AngleTo(Quaternion a, Quaternion b) => Quaternion.Angle(a, b);

        static readonly Quaternion[] Poses =
        {
            Quaternion.identity,
            Quaternion.Euler(0f, 45f, 0f),
            Quaternion.Euler(30f, -120f, 15f),
            Quaternion.Euler(-70f, 200f, -40f),
            Quaternion.Euler(12f, 0f, 89f),
        };

        [Test]
        public void 가르고_도로_붙이면_원래_자세다()
        {
            foreach (var q in Poses)
            {
                AxisLock.Decompose(q, out float yaw, out float pitch, out float roll);
                var back = AxisLock.Compose(yaw, pitch, roll);
                Assert.Less(AngleTo(q, back), 0.01f,
                    $"왕복에서 {AngleTo(q, back):F3}° 어긋났다 (요 {yaw:F1} 피치 {pitch:F1} 롤 {roll:F1})");
            }
        }

        [Test]
        public void 아무것도_안_잠그면_그대로_통과한다()
        {
            var l = new AxisLock();
            foreach (var q in Poses)
                Assert.AreEqual(0f, AngleTo(q, l.Apply(q)), 1e-4f, "안 잠갔는데 자세가 바뀌었다");
        }

        [Test]
        public void 좌우를_잠그면_좌우로_안_돈다()
        {
            var l = new AxisLock { lockPan = true };
            l.Hold(Quaternion.Euler(0f, 30f, 0f));

            var moved = l.Apply(Quaternion.Euler(20f, 150f, 0f));   // 좌우로 120° 휘둘렀다
            AxisLock.Decompose(moved, out float yaw, out float pitch, out _);
            Assert.AreEqual(30f, Mathf.DeltaAngle(0f, yaw), 0.01f, "잠갔는데 좌우로 돌았다");
            Assert.AreEqual(20f, pitch, 0.01f, "상하는 안 잠갔는데 막혔다");
        }

        [Test]
        public void 상하를_잠그면_상하로_안_돈다()
        {
            var l = new AxisLock { lockTilt = true };
            l.Hold(Quaternion.Euler(-10f, 0f, 0f));

            var moved = l.Apply(Quaternion.Euler(55f, 80f, 0f));
            AxisLock.Decompose(moved, out float yaw, out float pitch, out _);
            Assert.AreEqual(-10f, pitch, 0.01f, "잠갔는데 상하로 돌았다");
            Assert.AreEqual(80f, Mathf.DeltaAngle(0f, yaw), 0.01f, "좌우는 안 잠갔는데 막혔다");
        }

        [Test]
        public void 굴림을_잠그면_수평이_유지된다()
        {
            var l = new AxisLock { lockRoll = true };
            foreach (var q in new[]
            {
                Quaternion.Euler(0f, 0f, 35f),
                Quaternion.Euler(25f, 140f, -60f),
                Quaternion.Euler(-40f, -70f, 88f),
            })
            {
                var flat = l.Apply(q);
                AxisLock.Decompose(flat, out float yaw, out float pitch, out float roll);
                Assert.AreEqual(0f, roll, 0.01f, "굴림을 잠갔는데 지평선이 누웠다");

                // 겨냥 방향은 그대로여야 한다 — 수평만 맞추지 어디를 보는지는 안 바꾼다.
                AxisLock.Decompose(q, out float yaw0, out float pitch0, out _);
                Assert.AreEqual(0f, Mathf.DeltaAngle(yaw0, yaw), 0.01f, "수평을 맞추다 겨냥이 틀어졌다");
                Assert.AreEqual(pitch0, pitch, 0.01f, "수평을 맞추다 겨냥이 틀어졌다");
            }
        }

        [Test]
        public void 정수리를_겨눠도_안_터진다()
        {
            // 앞이 정확히 위/아래면 「수평이었다면」의 기준이 사라진다 — 거기서 NaN 이 나면
            // 카메라가 사라진다. 0 으로 두고 넘어가야 한다.
            foreach (var q in new[] { Quaternion.Euler(-90f, 0f, 0f), Quaternion.Euler(90f, 37f, 0f) })
            {
                AxisLock.Decompose(q, out float yaw, out float pitch, out float roll);
                Assert.IsFalse(float.IsNaN(yaw) || float.IsNaN(pitch) || float.IsNaN(roll), "NaN 이 나왔다");

                var l = new AxisLock { lockRoll = true };
                var outQ = l.Apply(q);
                Assert.IsFalse(float.IsNaN(outQ.x) || float.IsNaN(outQ.w), "자세가 NaN 이 됐다");
            }
        }

        [Test]
        public void 세_축을_다_잠그면_꼼짝도_안_한다()
        {
            var held = Quaternion.Euler(15f, -33f, 8f);
            var l = new AxisLock { lockPan = true, lockTilt = true, lockRoll = true };
            l.Hold(held);

            var outQ = l.Apply(Quaternion.Euler(-60f, 170f, 45f));
            AxisLock.Decompose(held, out float yaw0, out float pitch0, out _);
            AxisLock.Decompose(outQ, out float yaw, out float pitch, out float roll);

            Assert.AreEqual(0f, Mathf.DeltaAngle(yaw0, yaw), 0.01f);
            Assert.AreEqual(pitch0, pitch, 0.01f);
            Assert.AreEqual(0f, roll, 0.01f, "다 잠그면 수평이다");
        }
    }
}
