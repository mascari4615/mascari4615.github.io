using System.Collections.Generic;
using System.Globalization;
using System.IO;
using NUnit.Framework;
using UnityEngine;

namespace Handheld.Tests
{
    /// <summary>
    /// **실제로 사고가 난 기록**을 그대로 흘려 넣는다 — 합성으로는 이 사건을 못 만든다.
    ///   reloc-teleport-3m   공백 439ms 뒤 3.17m · 요 110°
    ///   reloc-spin-132deg   공백 1840ms 뒤 1.27m · 요 -132°  (+ 2963ms 뒤 롤 -75°)
    ///   reloc-clock-back    공백 15646ms · 폰 시각이 뒤로 갔다 (세션 재시작)
    ///
    /// 판정 둘: ① 어느 걸음도 사람이 낼 수 없는 속도를 내지 않는다 ② 추적이 끊긴
    /// 자리에서는 멈춰 있다. ②가 없으면 3초 공백에서 한도가 15m 가 되어 다 통과한다.
    /// 배경: `Documentation~/tracking.md`.
    /// </summary>
    public class TrackingStabilizerTests
    {
        // ★ 한 걸음의 **거리**를 상수로 재면 틀린다 (2026-08-21 실측에서 걸렸다).
        //   걸음 간격이 30ms 일 때와 113ms 일 때 사람이 옮길 수 있는 거리는 네 배 다르다.
        //   그래서 「사람이 낼 수 있는 값」은 **속도**로 두고, 걸음마다 그 걸음의 간격을
        //   곱해 한도를 만든다. 간격이 아주 크면(추적이 끊긴 구간) 한도가 무한정 늘어나므로
        //   HoldGapMs 에서 자른다 — 그 너머는 아래의 「멈춰 있어야 한다」가 따로 본다.
        const float HumanSpeed = 5f;           // 빠른 걸음이 3m/s 안팎 — 그 위는 사람이 아니다
        // 회전은 **요가 아니라 전체 각도**로 잰다 — 화면에서 보이는 것이 그것이고,
        // 요는 바닥·천장을 겨눌 때 정의가 흐려져 작은 회전을 173° 로 읽는다(실측).
        const float HumanTurnRate = 1000f;     // 아주 빠른 손목 스냅이 700~900°/s
        const double HoldGapMs = 250;          // 이보다 크게 비면 좌표계를 못 믿는다
        // 공백 뒤 첫 걸음에서 **우리가 이어 붙이는 자유도(위치·수직축 회전)** 는 사실상
        // 멈춰 있어야 한다. 피치·롤은 일부러 안 이어 붙인다 — 중력 기준의 참값이라
        // 억지로 맞추면 수평이 영구히 기운다(TrackingStabilizer 주석 참조). 그쪽은
        // 리그가 보간으로 밀어 넣으므로 여기서 재지 않는다.
        const float HoldMeters = 0.02f;
        const float HoldTwistDeg = 3f;

        static readonly string[] Fixtures =
        {
            "reloc-teleport-3m.csv",
            "reloc-spin-132deg.csv",
            "reloc-clock-back.csv",
        };

        struct Row
        {
            public double PhoneTime;
            public Vector3 Pos;
            public Quaternion Rot;
        }

        // 패키지 안의 자리. 유니티가 "Packages/<이름>/..." 을 실제 경로로 풀어 준다.
        static string FixturePath(string name) =>
            Path.GetFullPath("Packages/com.karmo.handheld/Tests/Fixtures/" + name);

        /// <summary>
        /// 성한 줄만 읽는다. 기록을 닫기 전에 프로세스가 죽으면 마지막 줄이 반쪽으로
        /// 남는데, 그 한 줄의 NaN 이 최댓값을 통째로 NaN 으로 만들고 NaN 비교는 전부
        /// false 라 **모든 단언이 조용히 통과한다** (분석기에서 실제로 그 일이 났다).
        /// </summary>
        static List<Row> Read(string name)
        {
            string path = FixturePath(name);
            Assert.IsTrue(File.Exists(path), "기록이 없다: " + path);

            var lines = File.ReadAllLines(path);
            var head = new List<string>(lines[0].Split(','));
            int iT = head.IndexOf("phone_t");
            int iX = head.IndexOf("raw_px"), iY = head.IndexOf("raw_py"), iZ = head.IndexOf("raw_pz");
            int iQx = head.IndexOf("raw_qx"), iQy = head.IndexOf("raw_qy"),
                iQz = head.IndexOf("raw_qz"), iQw = head.IndexOf("raw_qw");

            var rows = new List<Row>();
            for (int i = 1; i < lines.Length; i++)
            {
                var c = lines[i].Split(',');
                if (c.Length != head.Count) continue;                 // 잘린 줄
                if (!double.TryParse(c[iT], NumberStyles.Float, CultureInfo.InvariantCulture, out double t)) continue;
                if (!TryVec(c, iX, iY, iZ, out Vector3 p)) continue;
                if (!TryQuat(c, iQx, iQy, iQz, iQw, out Quaternion q)) continue;

                // 폰 좌표(RH, -Z 앞) → 유니티(LH, +Z 앞). 서버가 하는 변환과 같아야 한다.
                rows.Add(new Row
                {
                    PhoneTime = t,
                    Pos = new Vector3(p.x, p.y, -p.z),
                    Rot = new Quaternion(-q.x, -q.y, q.z, q.w),
                });
            }
            Assert.Greater(rows.Count, 100, name + ": 쓸 만한 줄이 너무 적다");
            return rows;
        }

        static bool TryVec(string[] c, int a, int b, int d, out Vector3 v)
        {
            v = default;
            if (!float.TryParse(c[a], NumberStyles.Float, CultureInfo.InvariantCulture, out float x)) return false;
            if (!float.TryParse(c[b], NumberStyles.Float, CultureInfo.InvariantCulture, out float y)) return false;
            if (!float.TryParse(c[d], NumberStyles.Float, CultureInfo.InvariantCulture, out float z)) return false;
            if (float.IsNaN(x) || float.IsNaN(y) || float.IsNaN(z)) return false;
            v = new Vector3(x, y, z);
            return true;
        }

        static bool TryQuat(string[] c, int a, int b, int d, int e, out Quaternion q)
        {
            q = Quaternion.identity;
            if (!TryVec(c, a, b, d, out Vector3 v)) return false;
            if (!float.TryParse(c[e], NumberStyles.Float, CultureInfo.InvariantCulture, out float w)) return false;
            if (float.IsNaN(w)) return false;
            q = new Quaternion(v.x, v.y, v.z, w);
            return true;
        }

        /// <summary>한 걸음이 그 걸음의 간격에 견줘 얼마나 과했는지 — 1 을 넘으면 사람이 못 하는 값.</summary>
        struct Excess
        {
            public float PosRatio, TurnRatio;     // 한도 대비 (1 초과 = 위반)
            public float WorstPosStep, WorstTurnStep;
            public float HoldPos, HoldTwist;      // 긴 공백 **뒤 첫 걸음**의 크기 (우리가 맡은 자유도)
            public int Reanchors, HoldSteps;
        }

        static Excess Measure(List<Row> rows, TrackingStabilizer st)
        {
            var e = new Excess();
            bool has = false;
            Vector3 prevP = default;
            Quaternion prevQ = Quaternion.identity;
            double prevT = 0;

            foreach (var r in rows)
            {
                Vector3 p;
                Quaternion q;
                if (st != null) st.Stabilize(r.PhoneTime, r.Pos, r.Rot, out p, out q);
                else { p = r.Pos; q = r.Rot; }

                if (has)
                {
                    double gap = r.PhoneTime - prevT;
                    float dPos = Vector3.Distance(p, prevP);
                    float dTurn = Quaternion.Angle(prevQ, q);
                    float dTwist = Mathf.Abs(TrackingStabilizer.TwistAboutUp(q * Quaternion.Inverse(prevQ)));

                    // 간격이 음수/0 이면 (세션 재시작) 한 걸음치로 친다
                    double useGap = gap <= 0 ? HoldGapMs : System.Math.Min(gap, HoldGapMs);
                    float dt = (float)(useGap / 1000.0);

                    e.PosRatio = Mathf.Max(e.PosRatio, dPos / (HumanSpeed * dt));
                    e.TurnRatio = Mathf.Max(e.TurnRatio, dTurn / (HumanTurnRate * dt));
                    e.WorstPosStep = Mathf.Max(e.WorstPosStep, dPos);
                    e.WorstTurnStep = Mathf.Max(e.WorstTurnStep, dTurn);

                    // 추적이 끊긴 자리 — 여기서 카메라는 멈춰 있어야 한다.
                    if (gap <= 0 || gap > HoldGapMs)
                    {
                        e.HoldSteps++;
                        e.HoldPos = Mathf.Max(e.HoldPos, dPos);
                        e.HoldTwist = Mathf.Max(e.HoldTwist, dTwist);
                    }
                }
                prevP = p;
                prevQ = q;
                prevT = r.PhoneTime;
                has = true;
            }
            e.Reanchors = st != null ? st.ReanchorCount : 0;
            return e;
        }

        [TestCaseSource(nameof(Fixtures))]
        public void 원본에는_사람이_못_내는_점프가_있다(string fixture)
        {
            // 이 단언이 없으면 안정기가 아무 일도 안 해도 아래 시험이 통과한다.
            // 「고치기 전에는 빨간가」를 시험 안에 박아 둔다.
            var e = Measure(Read(fixture), null);
            Assert.Greater(e.HoldSteps, 0, fixture + ": 공백이 없다 — 이 기록으로는 시험이 안 된다");
            Assert.IsTrue(e.HoldPos > HoldMeters || e.HoldTwist > HoldTwistDeg,
                fixture + ": 공백 뒤에 아무 일도 안 일어났다 — 기록이 잘못됐거나 시험이 무의미하다 " +
                "(위치 " + e.HoldPos.ToString("F3") + "m · 수직축 " + e.HoldTwist.ToString("F1") + "°)");
        }

        [TestCaseSource(nameof(Fixtures))]
        public void 안정기를_거치면_사람이_낼_수_있는_값만_남는다(string fixture)
        {
            var e = Measure(Read(fixture), new TrackingStabilizer());

            // ① 어느 걸음도 그 걸음의 간격에 견줘 사람이 못 낼 속도를 내지 않는다.
            Assert.LessOrEqual(e.PosRatio, 1f,
                fixture + ": 한 걸음이 사람 속도의 " + e.PosRatio.ToString("F2") + "배다 " +
                "(가장 큰 걸음 " + e.WorstPosStep.ToString("F3") + "m · 재앵커 " + e.Reanchors + "회)");
            Assert.LessOrEqual(e.TurnRatio, 1f,
                fixture + ": 사람 각속도의 " + e.TurnRatio.ToString("F2") + "배로 돌았다 " +
                "(가장 큰 걸음 " + e.WorstTurnStep.ToString("F1") + "° · 재앵커 " + e.Reanchors + "회)");

            // ② **추적이 끊긴 자리에서는 멈춰 있어야 한다.** 이게 사고의 본체다 —
            //    공백 뒤 첫 프레임에서 3.17m / 110° 가 그대로 나가던 것을 막는 단언.
            Assert.LessOrEqual(e.HoldPos, HoldMeters,
                fixture + ": 공백 뒤 첫 걸음에 " + e.HoldPos.ToString("F3") + "m 튀었다 " +
                "(재앵커 " + e.Reanchors + "회)");
            Assert.LessOrEqual(e.HoldTwist, HoldTwistDeg,
                fixture + ": 공백 뒤 첫 걸음에 수직축으로 " + e.HoldTwist.ToString("F1") + "° 튀었다 " +
                "(재앵커 " + e.Reanchors + "회)");
        }

        [TestCaseSource(nameof(Fixtures))]
        public void 재정위는_드물게만_잡는다_진짜_움직임을_먹지_않는다(string fixture)
        {
            // 좌표계를 자꾸 다시 맞추면 실제 이동이 통째로 사라진다. 실측 기준:
            // 이 기록들의 불연속 사건은 각 1~3회였다. 표본의 1% 를 넘으면 문턱이 잘못된 것이다.
            var rows = Read(fixture);
            var st = new TrackingStabilizer();
            int reanchors = Measure(rows, st).Reanchors;

            Assert.GreaterOrEqual(reanchors, 1, fixture + ": 사건이 있는 기록인데 한 번도 안 잡았다");
            Assert.LessOrEqual(reanchors, Mathf.Max(5, rows.Count / 100),
                fixture + ": 좌표계를 " + reanchors + "회나 다시 맞췄다 (" + rows.Count + "표본) — 문턱이 너무 좁다");
        }

        [TestCaseSource(nameof(Fixtures))]
        public void 재정위마다_리그에_알린다(string fixture)
        {
            // 남은 기울기(피치·롤)는 리그가 보간으로 밀어 넣는다 — 그 신호가 안 서면
            // 74° 기운 프레임이 한 번에 나간다. 깃발이 사건마다 정확히 한 번 서야 한다.
            var rows = Read(fixture);
            var st = new TrackingStabilizer();
            int flags = 0;
            foreach (var r in rows)
            {
                st.Stabilize(r.PhoneTime, r.Pos, r.Rot, out _, out _);
                if (st.ConsumeReanchored()) flags++;
            }
            Assert.AreEqual(st.ReanchorCount, flags,
                fixture + ": 좌표계는 " + st.ReanchorCount + "회 바꿨는데 알린 건 " + flags + "회다");
        }

        [Test]
        public void 평범한_움직임은_손대지_않는다()
        {
            // 30Hz 로 1m 를 부드럽게 걸으며 90° 도는 합성 자료. 안정기가 끼어들면 안 된다.
            var st = new TrackingStabilizer();
            double t = 1000;
            Vector3 lastOut = default;
            for (int i = 0; i <= 90; i++)
            {
                float u = i / 90f;
                st.Stabilize(t, new Vector3(u, 0f, u * 0.5f), Quaternion.Euler(0f, u * 90f, 0f),
                    out lastOut, out _);
                t += 33.3;
            }
            Assert.AreEqual(0, st.ReanchorCount, "평범한 걸음에 좌표계를 건드렸다");
            // 손대지 않았으면 결과가 원본과 같아야 한다.
            Assert.Less(Vector3.Distance(lastOut, new Vector3(1f, 0f, 0.5f)), 1e-4f);
        }

        [Test]
        public void 재정위_뒤에도_이어서_움직인다()
        {
            // 좌표계를 다시 맞춘 다음 **진짜 움직임이 그대로 살아나야** 한다.
            // 안 그러면 사고 한 번에 카메라가 얼어붙는다.
            var st = new TrackingStabilizer();
            double t = 1000;
            st.Stabilize(t, Vector3.zero, Quaternion.identity, out Vector3 before, out _);

            // 3초 공백 뒤 5m 떨어진 곳에서 90° 돌아 재개 (재정위)
            t += 3000;
            st.Stabilize(t, new Vector3(5f, 0f, 5f), Quaternion.Euler(0f, 90f, 0f), out Vector3 after, out _);
            Assert.AreEqual(1, st.ReanchorCount);
            Assert.Less(Vector3.Distance(before, after), 1e-3f, "재정위 순간에 카메라가 움직였다");

            // 그 뒤 실제로 새 좌표계에서 5cm 이동 — 결과에도 5cm 로 나와야 한다.
            // (처음엔 33ms 에 1m 로 썼다가 걸렸다 — 그건 30m/s 라 사람이 못 하는 값이고,
            //  게이트가 그걸 재정위로 본 게 맞다. 시험 자료 쪽이 틀렸던 것이다.)
            t += 33;
            st.Stabilize(t, new Vector3(5.05f, 0f, 5f), Quaternion.Euler(0f, 90f, 0f), out Vector3 moved, out _);
            Assert.AreEqual(1, st.ReanchorCount, "평범한 이동을 재정위로 오인했다");
            Assert.Less(Mathf.Abs(Vector3.Distance(moved, after) - 0.05f), 1e-3f,
                "재정위 뒤의 진짜 이동이 사라졌다");
        }
    }
}
