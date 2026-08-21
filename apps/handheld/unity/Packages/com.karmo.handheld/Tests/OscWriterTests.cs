using System.Text;
using NUnit.Framework;

namespace Handheld.Tests
{
    /// <summary>
    /// 전선에 나가는 **바이트 그대로**를 잰다. 「보내진다」로는 못 잡는 부류다 —
    /// 엔디안이 뒤집혀도 받는 쪽은 예외 없이 이상한 숫자를 쓸 뿐이라 조용히 틀린다.
    /// 기대값은 OSC 1.0 규격에서 손으로 짠 것이다.
    /// </summary>
    public class OscWriterTests
    {
        static byte[] Bytes(OscWriter w)
        {
            var outBuf = new byte[w.Length];
            System.Array.Copy(w.Buffer, outBuf, w.Length);
            return outBuf;
        }

        [Test]
        public void 주소와_타입태그는_널로_끝나고_4바이트_배수로_채워진다()
        {
            var w = new OscWriter().Begin("/VMC/Ext/T", "f").Float(0f);
            var b = Bytes(w);

            // "/VMC/Ext/T" = 10글자 -> 널 하나 붙여 11 -> 12 로 채운다
            Assert.AreEqual("/VMC/Ext/T", Encoding.UTF8.GetString(b, 0, 10));
            Assert.AreEqual(0, b[10]);
            Assert.AreEqual(0, b[11]);

            // ",f" = 2글자 -> 4 로 채운다
            Assert.AreEqual(",f", Encoding.UTF8.GetString(b, 12, 2));
            Assert.AreEqual(0, b[14]);
            Assert.AreEqual(0, b[15]);

            Assert.AreEqual(20, b.Length, "12 + 4 + float 4 여야 한다");
            Assert.AreEqual(0, b.Length % 4);
        }

        [Test]
        public void 딱_떨어지는_길이에도_널을_한_칸_더_붙인다()
        {
            // "/abc" 는 4글자 = 이미 배수다. 그래도 널이 필요하므로 8 이 된다.
            var b = Bytes(new OscWriter().Begin("/abc", "i").Int(0));
            Assert.AreEqual("/abc", Encoding.UTF8.GetString(b, 0, 4));
            Assert.AreEqual(0, b[4]);
            Assert.AreEqual(8 + 4 + 4, b.Length);
        }

        [Test]
        public void 숫자는_빅엔디안으로_나간다()
        {
            var b = Bytes(new OscWriter().Begin("/x", "i").Int(1));
            // 주소 4 + 타입태그 4 = 8 부터가 값
            Assert.AreEqual(new byte[] { 0, 0, 0, 1 }, new[] { b[8], b[9], b[10], b[11] });

            // 1.0f = 0x3F800000
            var f = Bytes(new OscWriter().Begin("/x", "f").Float(1f));
            Assert.AreEqual(new byte[] { 0x3F, 0x80, 0x00, 0x00 }, new[] { f[8], f[9], f[10], f[11] });
        }

        [Test]
        public void 카메라_메시지_한_통의_길이가_규격과_맞는다()
        {
            // /VMC/Ext/Cam (string)name (float)x8
            var w = new OscWriter()
                .Begin("/VMC/Ext/Cam", "sffffffff")
                .String("Handheld")
                .Float(1).Float(2).Float(3)
                .Float(0).Float(0).Float(0).Float(1)
                .Float(60);
            var b = Bytes(w);

            //  주소 "/VMC/Ext/Cam" 12글자 -> 16
            //  타입태그 ",sffffffff" 10글자 -> 12
            //  이름 "Handheld" 8글자 -> 12
            //  float 8개 -> 32
            Assert.AreEqual(16 + 12 + 12 + 32, b.Length);
            Assert.AreEqual("/VMC/Ext/Cam", Encoding.UTF8.GetString(b, 0, 12));
            Assert.AreEqual("Handheld", Encoding.UTF8.GetString(b, 28, 8));
        }

        [Test]
        public void 버퍼보다_큰_것을_담으면_조용히_자르지_않고_던진다()
        {
            var w = new OscWriter(16);
            Assert.Throws<System.InvalidOperationException>(() =>
                w.Begin("/아주아주아주긴주소를넣어본다", "f").Float(1f));
        }
    }
}
