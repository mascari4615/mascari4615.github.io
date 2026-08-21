using System;
using System.Text;

namespace Handheld
{
    /// <summary>
    /// OSC 1.0 메시지 한 통을 읽는다. 우리가 받는 만큼만 — 문자열·float·int.
    ///
    /// **전선에서 오는 것은 전부 의심한다.** 길이가 모자라거나 타입태그와 안 맞으면
    /// 던지지 않고 <see cref="Ok"/> 를 내린다 — 남의 앱이 쏘는 통이 섞여 들어와도
    /// 수신 루프가 죽으면 안 된다.
    /// </summary>
    public struct OscReader
    {
        readonly byte[] _buf;
        readonly int _end;
        int _pos;

        public string Address { get; private set; }
        public string TypeTags { get; private set; }
        public bool Ok { get; private set; }

        public OscReader(byte[] buffer, int length)
        {
            _buf = buffer;
            _end = length;
            _pos = 0;
            Address = "";
            TypeTags = "";
            Ok = true;

            Address = ReadPadded();
            string tags = ReadPadded();
            TypeTags = Ok && tags.Length > 0 && tags[0] == ',' ? tags.Substring(1) : "";
            if (Ok && TypeTags.Length == 0 && tags.Length > 0) Ok = false;
        }

        public float Float()
        {
            if (!Take(4, out int at)) return 0f;
            uint bits = (uint)((_buf[at] << 24) | (_buf[at + 1] << 16) | (_buf[at + 2] << 8) | _buf[at + 3]);
            return BitConverter.ToSingle(BitConverter.GetBytes(bits), 0);
        }

        public int Int()
        {
            if (!Take(4, out int at)) return 0;
            return (_buf[at] << 24) | (_buf[at + 1] << 16) | (_buf[at + 2] << 8) | _buf[at + 3];
        }

        public string String() => ReadPadded();

        bool Take(int n, out int at)
        {
            at = _pos;
            if (!Ok || _pos + n > _end) { Ok = false; return false; }
            _pos += n;
            return true;
        }

        /// <summary>널로 끝나고 4바이트 배수로 채워진 문자열 한 칸.</summary>
        string ReadPadded()
        {
            if (!Ok) return "";
            int start = _pos;
            while (_pos < _end && _buf[_pos] != 0) _pos++;
            if (_pos >= _end) { Ok = false; return ""; }      // 널을 못 찾았다 = 잘린 통

            string s = Encoding.UTF8.GetString(_buf, start, _pos - start);
            int len = _pos - start + 1;                        // 널 포함
            _pos = start + (len + 3) / 4 * 4;                  // 4바이트 배수로 올린다
            if (_pos > _end) { Ok = false; return ""; }
            return s;
        }
    }
}
