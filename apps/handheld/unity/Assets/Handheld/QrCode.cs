using System;
using System.Collections.Generic;

namespace Handheld
{
    /// <summary>
    /// 의존성 0 QR 인코더 — 바이트 모드만. 터널 주소를 폰 카메라로 찍어 들어오게 하려고 있다.
    /// 에셋을 들이지 않고 규격(ISO/IEC 18004)대로 직접 짠다. TASK-KAR-230.
    ///
    /// 검증 = 별도 구현(karmolab qrgen)과 모듈 행렬을 통째로 대조했다 — 표를 눈으로 옮겨 적는
    /// 코드라 「돌아가는 것 같다」로 끝내면 안 된다.
    /// </summary>
    public static class QrCode
    {
        public enum Ecc { Low = 0, Medium = 1 }

        // 규격 표 — 버전 1..40. 블록당 EC 코드워드 수 / 블록 개수.
        static readonly int[] EccPerBlockL = {
            7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,
            28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30 };
        static readonly int[] EccPerBlockM = {
            10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,
            26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28 };
        static readonly int[] BlocksL = {
            1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,
            8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25 };
        static readonly int[] BlocksM = {
            1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,
            17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49 };

        static int EccPerBlock(int ver, Ecc e) => (e == Ecc.Low ? EccPerBlockL : EccPerBlockM)[ver - 1];
        static int NumBlocks(int ver, Ecc e) => (e == Ecc.Low ? BlocksL : BlocksM)[ver - 1];

        /// <summary>이 버전의 심볼이 담는 전체 코드워드 수 (데이터 + EC).</summary>
        static int TotalCodewords(int ver) => RawDataModules(ver) / 8;

        /// <summary>기능 패턴·포맷/버전 정보를 뺀, 데이터가 들어갈 수 있는 모듈 수.</summary>
        static int RawDataModules(int ver)
        {
            int result = (16 * ver + 128) * ver + 64;
            if (ver >= 2)
            {
                int numAlign = ver / 7 + 2;
                result -= (25 * numAlign - 10) * numAlign - 55;
                if (ver >= 7) result -= 36;
            }
            return result;
        }

        static int DataCodewords(int ver, Ecc e)
            => TotalCodewords(ver) - EccPerBlock(ver, e) * NumBlocks(ver, e);

        /// <summary>
        /// text 를 QR 로 인코딩해 모듈 행렬을 돌려준다 ([y, x] = true 면 검은 칸).
        /// 담을 수 없으면 null (버전 40 초과).
        /// </summary>
        public static bool[,] Encode(string text, Ecc ecc = Ecc.Medium)
        {
            byte[] data = System.Text.Encoding.UTF8.GetBytes(text ?? string.Empty);

            // ① 담을 수 있는 가장 작은 버전을 고른다.
            int version = -1;
            for (int v = 1; v <= 40; v++)
            {
                int lenBits = v <= 9 ? 8 : 16;                 // 바이트 모드 문자 수 필드
                int needBits = 4 + lenBits + data.Length * 8;
                if (needBits <= DataCodewords(v, ecc) * 8) { version = v; break; }
            }
            if (version < 0) return null;

            // ② 비트스트림 — 모드(0100) + 길이 + 데이터 + 종단자 + 패딩.
            var bits = new BitBuffer();
            bits.Append(0x4, 4);
            bits.Append((uint)data.Length, version <= 9 ? 8 : 16);
            foreach (byte b in data) bits.Append(b, 8);

            int capacityBits = DataCodewords(version, ecc) * 8;
            bits.Append(0, Math.Min(4, capacityBits - bits.Count));
            bits.Append(0, (8 - bits.Count % 8) % 8);
            for (byte pad = 0xEC; bits.Count < capacityBits; pad = (byte)(pad ^ 0xFD))
                bits.Append(pad, 8);                            // 0xEC ↔ 0x11 번갈아

            // ③ 블록으로 쪼개고 각 블록에 RS 를 붙인 뒤 인터리브.
            byte[] codewords = AddEccAndInterleave(bits.ToBytes(), version, ecc);

            // ④ 기능 패턴을 놓고 데이터를 지그재그로 채운 뒤, 마스크 8개 중 벌점이 낮은 것을 고른다.
            var qr = new Symbol(version);
            qr.DrawFunctionPatterns();
            qr.DrawCodewords(codewords);
            qr.ApplyBestMask(ecc);
            return qr.Modules;
        }

        // ── 비트 버퍼 ────────────────────────────────────────────────────────────
        sealed class BitBuffer
        {
            readonly List<bool> _bits = new List<bool>();
            public int Count => _bits.Count;

            public void Append(uint value, int length)
            {
                for (int i = length - 1; i >= 0; i--)
                    _bits.Add(((value >> i) & 1) != 0);
            }

            public byte[] ToBytes()
            {
                var bytes = new byte[_bits.Count / 8];
                for (int i = 0; i < _bits.Count; i++)
                    if (_bits[i]) bytes[i >> 3] |= (byte)(1 << (7 - (i & 7)));
                return bytes;
            }
        }

        // ── Reed-Solomon (GF(256), 원시다항식 0x11D) ─────────────────────────────
        static byte[] RsDivisor(int degree)
        {
            var result = new byte[degree];
            result[degree - 1] = 1;              // 다항식 x^0 계수부터 오름차순
            byte root = 1;
            for (int i = 0; i < degree; i++)
            {
                for (int j = 0; j < degree; j++)
                {
                    result[j] = GfMul(result[j], root);
                    if (j + 1 < degree) result[j] ^= result[j + 1];
                }
                root = GfMul(root, 0x02);
            }
            return result;
        }

        static byte[] RsRemainder(byte[] data, byte[] divisor)
        {
            var result = new byte[divisor.Length];
            foreach (byte b in data)
            {
                byte factor = (byte)(b ^ result[0]);
                Array.Copy(result, 1, result, 0, result.Length - 1);
                result[result.Length - 1] = 0;
                for (int i = 0; i < result.Length; i++)
                    result[i] ^= GfMul(divisor[i], factor);
            }
            return result;
        }

        static byte GfMul(byte x, byte y)
        {
            int z = 0;
            for (int i = 7; i >= 0; i--)
            {
                z = (z << 1) ^ ((z >> 7) * 0x11D);
                z ^= ((y >> i) & 1) * x;
            }
            return (byte)z;
        }

        static byte[] AddEccAndInterleave(byte[] data, int version, Ecc ecc)
        {
            int numBlocks = NumBlocks(version, ecc);
            int eccLen = EccPerBlock(version, ecc);
            int rawCodewords = TotalCodewords(version);

            int numShort = numBlocks - rawCodewords % numBlocks;   // 짧은 블록 개수
            int shortTotal = rawCodewords / numBlocks;             // 짧은 블록의 전체 길이
            int shortData = shortTotal - eccLen;                   // 그중 데이터 길이

            // 블록 배열은 전부 같은 길이(긴 블록 기준)로 잡는다. 짧은 블록은 데이터 끝에 빈칸이
            // 하나 생기고, EC 코드워드는 언제나 **배열 맨 뒤**에 놓인다 — 인터리브가 그 빈칸만
            // 건너뛰면 되도록 하는 규격의 배치다. 여기를 데이터 바로 뒤에 붙이면 EC 가 한 칸씩
            // 밀려 「데이터는 맞는데 EC 만 전부 틀린」 QR 이 나온다 (2026-08-20 실측으로 잡음).
            int blockLen = shortTotal + 1;
            var blocks = new byte[numBlocks][];
            var divisor = RsDivisor(eccLen);

            for (int i = 0, k = 0; i < numBlocks; i++)
            {
                int dataLen = shortData + (i < numShort ? 0 : 1);
                var dat = new byte[dataLen];
                Array.Copy(data, k, dat, 0, dataLen);
                k += dataLen;

                var block = new byte[blockLen];
                Array.Copy(dat, block, dataLen);
                Array.Copy(RsRemainder(dat, divisor), 0, block, blockLen - eccLen, eccLen);
                blocks[i] = block;
            }

            // 인터리브 — 각 블록의 i 번째를 차례로. 짧은 블록의 빈칸(i == shortData)만 건너뛴다.
            var result = new byte[rawCodewords];
            for (int i = 0, k = 0; i < blockLen; i++)
            {
                for (int j = 0; j < numBlocks; j++)
                {
                    if (i == shortData && j < numShort) continue;
                    result[k++] = blocks[j][i];
                }
            }
            return result;
        }

        // ── 심볼 그리기 ──────────────────────────────────────────────────────────
        sealed class Symbol
        {
            public readonly bool[,] Modules;      // [y, x]
            readonly bool[,] _function;           // 데이터가 못 들어가는 칸
            readonly int _size, _version;

            public Symbol(int version)
            {
                _version = version;
                _size = version * 4 + 17;
                Modules = new bool[_size, _size];
                _function = new bool[_size, _size];
            }

            void Set(int x, int y, bool dark, bool isFunction)
            {
                if (x < 0 || y < 0 || x >= _size || y >= _size) return;
                Modules[y, x] = dark;
                if (isFunction) _function[y, x] = true;
            }

            public void DrawFunctionPatterns()
            {
                // 타이밍 패턴
                for (int i = 0; i < _size; i++)
                {
                    Set(6, i, i % 2 == 0, true);
                    Set(i, 6, i % 2 == 0, true);
                }

                // 파인더 3개 + 분리자
                DrawFinder(3, 3);
                DrawFinder(_size - 4, 3);
                DrawFinder(3, _size - 4);

                // 정렬 패턴 — 파인더와 겹치는 세 모서리는 뺀다
                int[] align = AlignmentPositions(_version);
                for (int i = 0; i < align.Length; i++)
                {
                    for (int j = 0; j < align.Length; j++)
                    {
                        bool corner = (i == 0 && j == 0)
                                   || (i == 0 && j == align.Length - 1)
                                   || (i == align.Length - 1 && j == 0);
                        if (!corner) DrawAlignment(align[i], align[j]);
                    }
                }

                // 포맷/버전 정보 자리는 예약만 (마스크가 정해진 뒤 값이 들어간다)
                DrawFormatBits(0, 0);
                DrawVersionBits();
            }

            void DrawFinder(int cx, int cy)
            {
                for (int dy = -4; dy <= 4; dy++)
                {
                    for (int dx = -4; dx <= 4; dx++)
                    {
                        int dist = Math.Max(Math.Abs(dx), Math.Abs(dy));   // 체비쇼프 거리
                        int x = cx + dx, y = cy + dy;
                        if (x >= 0 && x < _size && y >= 0 && y < _size)
                            Set(x, y, dist != 2 && dist != 4, true);
                    }
                }
            }

            void DrawAlignment(int cx, int cy)
            {
                for (int dy = -2; dy <= 2; dy++)
                    for (int dx = -2; dx <= 2; dx++)
                        Set(cx + dx, cy + dy, Math.Max(Math.Abs(dx), Math.Abs(dy)) != 1, true);
            }

            static int[] AlignmentPositions(int ver)
            {
                if (ver == 1) return new int[0];
                int numAlign = ver / 7 + 2;
                int size = ver * 4 + 17;
                int step = ver == 32 ? 26 : (size - 13 + (2 * numAlign - 2) - 1) / (2 * numAlign - 2) * 2;
                var result = new int[numAlign];
                result[0] = 6;
                for (int i = numAlign - 1, pos = size - 7; i >= 1; i--, pos -= step)
                    result[i] = pos;
                return result;
            }

            /// <summary>포맷 정보 15비트 (EC 레벨 + 마스크, BCH). 두 곳에 같은 값을 쓴다.</summary>
            public void DrawFormatBits(int eccFormatBits, int mask)
            {
                int data = eccFormatBits << 3 | mask;
                int rem = data;
                for (int i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
                int bits = (data << 10 | rem) ^ 0x5412;

                for (int i = 0; i <= 5; i++) Set(8, i, GetBit(bits, i), true);
                Set(8, 7, GetBit(bits, 6), true);
                Set(8, 8, GetBit(bits, 7), true);
                Set(7, 8, GetBit(bits, 8), true);
                for (int i = 9; i < 15; i++) Set(14 - i, 8, GetBit(bits, i), true);

                for (int i = 0; i < 8; i++) Set(_size - 1 - i, 8, GetBit(bits, i), true);
                for (int i = 8; i < 15; i++) Set(8, _size - 15 + i, GetBit(bits, i), true);
                Set(8, _size - 8, true, true);     // 항상 검은 모듈
            }

            void DrawVersionBits()
            {
                if (_version < 7) return;
                int rem = _version;
                for (int i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
                int bits = _version << 12 | rem;

                for (int i = 0; i < 18; i++)
                {
                    bool bit = GetBit(bits, i);
                    int a = _size - 11 + i % 3, b = i / 3;
                    Set(a, b, bit, true);
                    Set(b, a, bit, true);
                }
            }

            static bool GetBit(int x, int i) => ((x >> i) & 1) != 0;

            /// <summary>데이터 코드워드를 오른쪽 아래에서 지그재그로 채운다.</summary>
            public void DrawCodewords(byte[] data)
            {
                int i = 0;
                for (int right = _size - 1; right >= 1; right -= 2)
                {
                    if (right == 6) right = 5;      // 세로 타이밍 열은 건너뛴다
                    for (int vert = 0; vert < _size; vert++)
                    {
                        for (int j = 0; j < 2; j++)
                        {
                            int x = right - j;
                            bool upward = ((right + 1) & 2) == 0;
                            int y = upward ? _size - 1 - vert : vert;
                            if (_function[y, x] || i >= data.Length * 8) continue;
                            Modules[y, x] = GetBit(data[i >> 3], 7 - (i & 7));
                            i++;
                        }
                    }
                }
            }

            public void ApplyBestMask(Ecc ecc)
            {
                int eccBits = ecc == Ecc.Low ? 1 : 0;      // 규격상 L=01, M=00
                int bestMask = 0, bestPenalty = int.MaxValue;

                for (int mask = 0; mask < 8; mask++)
                {
                    ApplyMask(mask);
                    DrawFormatBits(eccBits, mask);
                    int penalty = Penalty();
                    if (penalty < bestPenalty) { bestPenalty = penalty; bestMask = mask; }
                    ApplyMask(mask);                        // XOR 이라 다시 걸면 원상복구
                }

                ApplyMask(bestMask);
                DrawFormatBits(eccBits, bestMask);
            }

            void ApplyMask(int mask)
            {
                for (int y = 0; y < _size; y++)
                {
                    for (int x = 0; x < _size; x++)
                    {
                        if (_function[y, x]) continue;
                        bool invert;
                        switch (mask)
                        {
                            case 0: invert = (x + y) % 2 == 0; break;
                            case 1: invert = y % 2 == 0; break;
                            case 2: invert = x % 3 == 0; break;
                            case 3: invert = (x + y) % 3 == 0; break;
                            case 4: invert = (x / 3 + y / 2) % 2 == 0; break;
                            case 5: invert = x * y % 2 + x * y % 3 == 0; break;
                            case 6: invert = (x * y % 2 + x * y % 3) % 2 == 0; break;
                            default: invert = ((x + y) % 2 + x * y % 3) % 2 == 0; break;
                        }
                        Modules[y, x] ^= invert;
                    }
                }
            }

            /// <summary>규격의 벌점 4규칙 — 읽기 어려운 무늬를 고르지 않게 한다.</summary>
            int Penalty()
            {
                const int N1 = 3, N2 = 3, N3 = 40, N4 = 10;
                int result = 0;

                // 규칙 1 — 같은 색 5칸 이상 연속 (가로·세로)
                for (int y = 0; y < _size; y++) result += RunPenalty(y, true, N1);
                for (int x = 0; x < _size; x++) result += RunPenalty(x, false, N1);

                // 규칙 2 — 2×2 같은 색 블록
                for (int y = 0; y < _size - 1; y++)
                    for (int x = 0; x < _size - 1; x++)
                        if (Modules[y, x] == Modules[y, x + 1]
                         && Modules[y, x] == Modules[y + 1, x]
                         && Modules[y, x] == Modules[y + 1, x + 1]) result += N2;

                // 규칙 3 — 파인더를 흉내내는 1:1:3:1:1 무늬 (+ 한쪽 4칸 여백)
                for (int y = 0; y < _size; y++)
                    for (int x = 0; x < _size; x++)
                    {
                        if (MatchesFinderLike(x, y, true)) result += N3;
                        if (MatchesFinderLike(x, y, false)) result += N3;
                    }

                // 규칙 4 — 검은 칸 비율이 50% 에서 멀수록
                int dark = 0;
                foreach (bool m in Modules) if (m) dark++;
                int total = _size * _size;
                int k = (Math.Abs(dark * 20 - total * 10) + total - 1) / total - 1;
                result += k * N4;
                return result;
            }

            int RunPenalty(int line, bool horizontal, int n1)
            {
                int result = 0, runLen = 1;
                bool color = horizontal ? Modules[line, 0] : Modules[0, line];
                for (int i = 1; i < _size; i++)
                {
                    bool m = horizontal ? Modules[line, i] : Modules[i, line];
                    if (m == color) { runLen++; }
                    else { color = m; runLen = 1; }
                    if (runLen == 5) result += n1;
                    else if (runLen > 5) result++;
                }
                return result;
            }

            /// <summary>(x,y) 에서 시작하는 11칸이 「1:1:3:1:1 + 4칸 여백」무늬인가.</summary>
            bool MatchesFinderLike(int x, int y, bool horizontal)
            {
                const int Len = 11;                                  // 무늬 7 + 여백 4
                if (horizontal ? x + Len > _size : y + Len > _size) return false;

                bool lead = true, trail = true;
                for (int i = 0; i < Len; i++)
                {
                    bool m = horizontal ? Modules[y, x + i] : Modules[y + i, x];
                    if (m != LeadPattern(i)) lead = false;
                    if (m != TrailPattern(i)) trail = false;
                    if (!lead && !trail) return false;
                }
                return lead || trail;
            }

            // 여백이 앞에 오는 경우: ....⬛⬜⬛⬛⬛⬜⬛
            static bool LeadPattern(int i)
            {
                switch (i)
                {
                    case 0: case 1: case 2: case 3: return false;  // 여백 4
                    case 4: return true;
                    case 5: return false;
                    case 6: case 7: case 8: return true;
                    case 9: return false;
                    default: return true;
                }
            }

            // 여백이 뒤에 오는 경우: ⬛⬜⬛⬛⬛⬜⬛....
            static bool TrailPattern(int i)
            {
                switch (i)
                {
                    case 0: return true;
                    case 1: return false;
                    case 2: case 3: case 4: return true;
                    case 5: return false;
                    case 6: return true;
                    default: return false;                         // 여백 4
                }
            }
        }
    }
}
