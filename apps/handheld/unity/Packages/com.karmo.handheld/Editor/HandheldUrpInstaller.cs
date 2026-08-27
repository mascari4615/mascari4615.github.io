using System;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using UnityEngine;
using UnityEngine.Rendering;

namespace Handheld.EditorTools
{
    /// <summary>
    /// URP 를 깔고 배선까지 이어 준다 — 조종석의 「URP 켜기」 버튼이 부르는 쪽. TASK-KAR-230.
    ///
    /// **이 파일은 URP 타입을 하나도 안 쓴다.** URP 가 없을 때도 컴파일돼야 하기 때문이다.
    /// 실제 배선(파이프라인 에셋 만들기·볼륨 조립)은 URP 가 깔린 뒤에야 존재하는
    /// `Handheld.Urp` 어셈블리 안에 있고, 여기서는 **메뉴 항목 이름으로** 부른다.
    ///
    /// 패키지를 깔면 도메인 리로드가 일어나 이 클래스의 상태가 날아간다 — 그래서 「깐 뒤에
    /// 배선하라」를 `SessionState` 에 적어 두고, 리로드된 뒤 스스로 이어 간다.
    /// </summary>
    public static class HandheldUrpInstaller
    {
        const string UrpPackage = "com.unity.render-pipelines.universal";
        const string UrpTypeName =
            "UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset, Unity.RenderPipelines.Universal.Runtime";

        const string MenuWirePipeline = "Handheld/URP/Wire Pipeline";
        const string MenuWireDof = "Handheld/URP/Add Depth of Field to Scene";

        const string PendingKey = "Handheld.Urp.WireAfterReload";

        static AddRequest _add;

        /// <summary>URP 패키지가 프로젝트에 있나 (타입이 보이면 있다).</summary>
        public static bool UrpInstalled => Type.GetType(UrpTypeName) != null;

        /// <summary>지금 실제로 URP 로 그리고 있나.</summary>
        public static bool UrpActive => GraphicsSettings.currentRenderPipeline != null;

        /// <summary>패키지를 까는 중인가.</summary>
        public static bool Installing => _add != null && !_add.IsCompleted;

        /// <summary>
        /// URP 를 깔고, 다 깔리면 파이프라인 배선 + 씬 볼륨까지 이어서 한다.
        /// 버전은 안 적는다 — 패키지 매니저가 이 유니티에 맞는 판을 고르게 둔다.
        /// </summary>
        [MenuItem("Handheld/URP/Enable URP (Install + Wire)", false, 90)]
        public static void InstallAndWire()
        {
            if (UrpInstalled)
            {
                Wire();
                return;
            }
            if (Installing) return;

            Debug.Log("[Handheld] URP 설치 시작 — 다 깔리면 배선까지 이어서 한다.");
            SessionState.SetBool(PendingKey, true);
            _add = Client.Add(UrpPackage);
            EditorApplication.update += PollInstall;
        }

        static void PollInstall()
        {
            if (_add == null) { EditorApplication.update -= PollInstall; return; }
            if (!_add.IsCompleted) return;

            EditorApplication.update -= PollInstall;
            var req = _add;
            _add = null;

            if (req.Status == StatusCode.Success)
            {
                // 여기서 곧 도메인 리로드가 온다 — 이어지는 배선은 리로드 뒤에 스스로 한다.
                Debug.Log($"[Handheld] URP 설치됨: {req.Result.packageId}");
            }
            else
            {
                SessionState.SetBool(PendingKey, false);
                Debug.LogError("[Handheld] URP 설치 실패: " + (req.Error != null ? req.Error.message : "알 수 없음") +
                               "\n손으로: Window → Package Manager → Unity Registry → Universal RP → Install");
            }
        }

        /// <summary>도메인 리로드 뒤에 「배선하라」가 적혀 있으면 이어서 한다.</summary>
        [InitializeOnLoadMethod]
        static void ContinueAfterReload()
        {
            if (!SessionState.GetBool(PendingKey, false)) return;
            if (!UrpInstalled) return;               // 아직 임포트 중 — 다음 리로드에 다시 본다

            SessionState.SetBool(PendingKey, false);
            EditorApplication.delayCall += Wire;
        }

        /// <summary>파이프라인 + 씬 볼륨 배선. URP 가 이미 깔려 있어야 한다.</summary>
        [MenuItem("Handheld/URP/Rewire Only", false, 91)]
        public static void Wire()
        {
            if (!UrpInstalled)
            {
                Debug.LogError("[Handheld] URP 가 아직 없다 — 「URP 켜기 (설치 + 배선)」 부터.");
                return;
            }

            // 메뉴 항목이 없다 = Handheld.Urp 어셈블리가 아직 안 컴파일됐다는 뜻이다.
            if (!EditorApplication.ExecuteMenuItem(MenuWirePipeline))
            {
                Debug.LogWarning("[Handheld] 배선 메뉴를 아직 못 찾았다 (컴파일 중일 수 있다) — " +
                                 "잠시 뒤 「Handheld/URP/배선만 다시」를 눌러라.");
                return;
            }
            EditorApplication.ExecuteMenuItem(MenuWireDof);
        }

        /// <summary>조종석이 띄울 한 줄.</summary>
        public static string StatusLine =>
            Installing ? "URP 설치 중…"
            : !UrpInstalled ? "URP 없음 — 초점 흐림을 그릴 수단이 없다"
            : UrpActive ? "URP 로 그리는 중 — 초점 흐림 가능"
            : "URP 는 깔렸는데 파이프라인이 안 꽂혔다 — 「배선만 다시」";
    }
}
