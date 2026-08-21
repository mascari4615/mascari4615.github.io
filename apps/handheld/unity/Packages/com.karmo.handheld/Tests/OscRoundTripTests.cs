using NUnit.Framework;
using UnityEngine;

namespace Handheld.Tests
{
    /// <summary>
    /// 보낸 것이 그대로 읽히나. 인코더만 시험하면 **디코더가 같은 방향으로 틀렸을 때**
    /// 둘 다 통과한다 — 그래서 바이트 배치를 재는 시험(OscWriterTests)을 따로 두고,
    /// 여기서는 값이 살아 돌아오는지만 본다.
    ///
    /// 전선에서 오는 통은 전부 의심한다 — 잘리거나 타입이 다르면 **던지지 말고 버려야**
    /// 한다. 수신 루프가 죽으면 방송이 멈춘다.
    /// </summary>
    public class OscRoundTripTests
    {
        static byte[] Bytes(OscWriter w)
        {
            var b = new byte[w.Length];
            System.Array.Copy(w.Buffer, b, w.Length);
            return b;
        }

        [Test]
        public void 카메라_한_통이_값_그대로_돌아온다()
        {
            var p = new Vector3(1.25f, -0.5f, 3f);
            var q = Quaternion.Euler(10f, 200f, -30f);

            var b = Bytes(new OscWriter()
                .Begin("/VMC/Ext/Cam", "sffffffff")
                .String("Handheld")
                .Float(p.x).Float(p.y).Float(p.z)
                .Float(q.x).Float(q.y).Float(q.z).Float(q.w)
                .Float(53.5f));

            var r = new OscReader(b, b.Length);
            Assert.IsTrue(r.Ok);
            Assert.AreEqual("/VMC/Ext/Cam", r.Address);
            Assert.AreEqual("sffffffff", r.TypeTags);
            Assert.AreEqual("Handheld", r.String());
            Assert.AreEqual(p.x, r.Float(), 1e-6f);
            Assert.AreEqual(p.y, r.Float(), 1e-6f);
            Assert.AreEqual(p.z, r.Float(), 1e-6f);
            Assert.AreEqual(q.x, r.Float(), 1e-6f);
            Assert.AreEqual(q.y, r.Float(), 1e-6f);
            Assert.AreEqual(q.z, r.Float(), 1e-6f);
            Assert.AreEqual(q.w, r.Float(), 1e-6f);
            Assert.AreEqual(53.5f, r.Float(), 1e-6f);
            Assert.IsTrue(r.Ok, "다 읽고도 성해야 한다");
        }

        [Test]
        public void 잘린_통은_던지지_않고_버린다()
        {
            var b = Bytes(new OscWriter()
                .Begin("/VMC/Ext/Cam", "sffffffff")
                .String("Handheld")
                .Float(1).Float(2).Float(3).Float(0).Float(0).Float(0).Float(1).Float(60));

            for (int cut = 1; cut < b.Length; cut += 3)
            {
                var r = new OscReader(b, cut);
                Assert.DoesNotThrow(() =>
                {
                    r.String();
                    for (int i = 0; i < 8; i++) r.Float();
                }, $"{cut}바이트에서 잘렸을 때 던졌다");
            }
        }

        [Test]
        public void 수신부는_잘린_통에_값을_안_바꾼다()
        {
            var go = new GameObject("vmc-test");
            try
            {
                var rx = go.AddComponent<VmcCameraReceiver>();
                rx.enabled = false;                       // 포트를 열지 않고 파서만 시험한다
                rx.cameraName = "Handheld";

                var b = Bytes(new OscWriter()
                    .Begin("/VMC/Ext/Cam", "sffffffff")
                    .String("Handheld")
                    .Float(9).Float(9).Float(9).Float(0).Float(0).Float(0).Float(1).Float(60));

                Assert.DoesNotThrow(() => rx.Parse(b, b.Length / 2));
                Assert.DoesNotThrow(() => rx.Parse(new byte[] { 1, 2, 3 }, 3));
                Assert.AreEqual(Vector3.zero, go.transform.position, "잘린 통이 자세를 바꿨다");
            }
            finally { Object.DestroyImmediate(go); }
        }

        [Test]
        public void 다른_이름의_카메라는_무시한다()
        {
            var go = new GameObject("vmc-test");
            try
            {
                var rx = go.AddComponent<VmcCameraReceiver>();
                rx.enabled = false;
                rx.cameraName = "Handheld";

                var b = Bytes(new OscWriter()
                    .Begin("/VMC/Ext/Cam", "sffffffff")
                    .String("SomeoneElse")
                    .Float(5).Float(5).Float(5).Float(0).Float(0).Float(0).Float(1).Float(60));

                rx.Parse(b, b.Length);
                Assert.AreEqual(Vector3.zero, go.transform.position, "남의 카메라를 따라갔다");
            }
            finally { Object.DestroyImmediate(go); }
        }

        [Test]
        public void 모르는_주소는_그냥_버린다()
        {
            var b = Bytes(new OscWriter().Begin("/누군가/다른것", "f").Float(1f));
            var go = new GameObject("vmc-test");
            try
            {
                var rx = go.AddComponent<VmcCameraReceiver>();
                rx.enabled = false;
                Assert.DoesNotThrow(() => rx.Parse(b, b.Length));
                Assert.AreEqual(Vector3.zero, go.transform.position);
            }
            finally { Object.DestroyImmediate(go); }
        }
    }
}
