using System;
using System.Text;

namespace Handheld
{
    /// <summary>
    /// OSC 1.0 메시지 한 통을 바이트로 짠다. 우리가 보내는 만큼만 — 문자열·float·int.
    ///
    /// 남이 만든 라이브러리를 안 쓰는 이유: 필요한 게 이 40줄뿐인데 패키지 의존을 하나
    /// 늘리면 우리 패키지를 넣는 쪽도 그걸 같이 받아야 한다. 규약은 `Documentation~/vmc.md`.
    ///
    /// 규칙 셋만 지키면 된다: **빅엔디안** · 문자열은 **널로 끝나고** · 모든 칸은 **4바이트 배수**.
    /// </summary>
    public sealed class OscWriter
    {
        readonly byte[] _buf;
        int _len;

        public OscWriter(int capacity = 512) { _buf = new byte[capacity]; }

        public int Length => _len;
        public byte[] Buffer => _buf;

        public OscWriter Begin(string address, string typeTags)
        {
            _len = 0;
            WritePadded(address);
            WritePadded("," + typeTags);
            return this;
        }

        public OscWriter Float(float v)
        {
            // 빅엔디안. BitConverter 는 이 기계의 순서를 따르므로 뒤집어야 한다.
            uint bits = BitConverter.ToUInt32(BitConverter.GetBytes(v), 0);
            return UInt32BigEndian(bits);
        }

        public OscWriter Int(int v) => UInt32BigEndian(unchecked((uint)v));

        public OscWriter String(string v) { WritePadded(v); return this; }

        OscWriter UInt32BigEndian(uint bits)
        {
            Need(4);
            _buf[_len++] = (byte)(bits >> 24);
            _buf[_len++] = (byte)(bits >> 16);
            _buf[_len++] = (byte)(bits >> 8);
            _buf[_len++] = (byte)bits;
            return this;
        }

        /// <summary>널 하나를 붙이고 4바이트 배수가 될 때까지 널로 채운다.</summary>
        void WritePadded(string s)
        {
            int n = Encoding.UTF8.GetByteCount(s);
            int total = (n / 4 + 1) * 4;          // 널이 최소 하나는 들어가도록 올린다
            Need(total);
            Encoding.UTF8.GetBytes(s, 0, s.Length, _buf, _len);
            for (int i = _len + n; i < _len + total; i++) _buf[i] = 0;
            _len += total;
        }

        void Need(int more)
        {
            if (_len + more > _buf.Length)
                throw new InvalidOperationException($"OSC 버퍼가 작다 ({_buf.Length}바이트) — 보내려는 것이 더 크다");
        }
    }
}
