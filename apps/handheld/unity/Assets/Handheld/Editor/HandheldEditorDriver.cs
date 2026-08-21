using UnityEditor;
using UnityEngine;

namespace Handheld.EditorTools
{
    /// <summary>
    /// 편집 모드에서 리그를 돌리는 **심장**. TASK-KAR-245.
    ///
    /// ★ 왜 창에서 여기로 옮겼나 (2026-08-21 실측):
    ///   원래는 조종석 창(`HandheldWindow`)이 `EditorApplication.update` 로 리그를 돌렸다.
    ///   그런데 **창은 닫힌다** — 레이아웃이 바뀌거나, 패키지 리임포트로 도메인 리로드가
    ///   나거나, 사람이 실수로 닫으면 그걸로 끝이다. 그러면 서버는 살아서 포트를 잡고
    ///   폰의 접속까지 받아들이는데(ExecuteAlways) **아무것도 안 보낸다.**
    ///   폰 화면은 그냥 검다. 어디가 멎었는지 알려 주는 것도 없다.
    ///
    ///   실측(2026-08-21): URP 머티리얼 업그레이드가 도메인 리로드를 일으킨 뒤,
    ///   WS 는 열리는데 **JPEG 0장 · 상태 줄 0줄**이었다. 1초마다 가야 할 상태 줄조차 안 갔다.
    ///
    ///   심장이 창에 달려 있으면 안 된다. `[InitializeOnLoad]` 는 도메인 리로드마다 다시
    ///   불리므로, 리로드가 나도 스스로 다시 뛴다.
    ///
    /// 조종석 창은 이제 **보여 주기만** 한다 (터널·QR·손잡이).
    /// </summary>
    [InitializeOnLoad]
    public static class HandheldEditorDriver
    {
        static HandheldServer _server;
        static HandheldRig _rig;
        static double _nextScan;

        static HandheldEditorDriver()
        {
            EditorApplication.update -= Tick;
            EditorApplication.update += Tick;
        }

        /// <summary>지금 심장이 잡고 있는 것 — 조종석이 「왜 안 도나」를 보여 줄 때 쓴다.</summary>
        public static bool HasServer => _server != null;
        public static bool HasRig => _rig != null;

        static void Tick()
        {
            // Play 중에는 MonoBehaviour.Update 가 돈다 — 두 번 돌리면 dt 가 반토막 난다.
            if (Application.isPlaying) return;

            // 매 틱 씬을 훑으면 700Hz 로 FindAnyObjectByType 을 부른다. 초당 두 번만 찾는다.
            double now = EditorApplication.timeSinceStartup;
            if (_server == null || _rig == null || now >= _nextScan)
            {
                _nextScan = now + 0.5;
                if (_server == null) _server = Object.FindAnyObjectByType<HandheldServer>();
                if (_rig == null) _rig = Object.FindAnyObjectByType<HandheldRig>();
            }

            // ★ 따로 감싼다 (2026-08-21). 예전엔 한 줄로 이어 불렀는데, 서버 쪽에서 던지자
            //   **리그가 통째로 안 돌았다** — 프레임 0장, 화면 검정. 진단도 「포즈 0」으로만
            //   보여서 원인이 옆 동네인 줄 몰랐다. 하나가 죽어도 나머지는 뛰어야 한다.
            if (_server != null && _server.isActiveAndEnabled)
            {
                try { _server.Tick(); }
                catch (System.Exception e) { Debug.LogWarning("[Handheld] 서버 틱 실패: " + e.Message); }
            }
            if (_rig != null && _rig.isActiveAndEnabled)
            {
                try { _rig.ManualTick(true); }
                catch (System.Exception e) { Debug.LogWarning("[Handheld] 리그 틱 실패: " + e.Message); }
            }
        }
    }
}
