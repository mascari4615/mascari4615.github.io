#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Handheld.Urp
{
    /// <summary>
    /// URP 를 「손으로 클릭할 것 0」으로 깔아 준다 — 파이프라인 에셋 생성·배선과 씬 볼륨 조립.
    /// TASK-KAR-230.
    ///
    /// 이 파일은 `Handheld.Urp` 어셈블리 안에 있으므로 **URP 가 깔린 뒤에야 존재한다.**
    /// 그래서 바깥(조종석)은 타입을 직접 부르지 않고 `EditorApplication.ExecuteMenuItem` 으로
    /// 부른다 — URP 가 없을 때 컴파일이 깨지지 않는 유일한 길이다.
    /// </summary>
    public static class HandheldUrpBootstrap
    {
        const string SettingsDir = "Assets/Settings";
        const string PipelinePath = SettingsDir + "/HandheldURP.asset";
        const string RendererPath = SettingsDir + "/HandheldURPRenderer.asset";
        const string ProfilePath = SettingsDir + "/HandheldVolume.asset";

        /// <summary>URP 에셋을 만들고 그래픽스·품질 설정에 꽂는다. 이미 URP 면 아무것도 안 한다.</summary>
        [MenuItem("Handheld/URP/Wire Pipeline", false, 100)]
        public static void WirePipeline()
        {
            try
            {
                if (GraphicsSettings.defaultRenderPipeline is UniversalRenderPipelineAsset already)
                {
                    Debug.Log($"[Handheld] 이미 URP 다 ({already.name}) — 건드리지 않는다.");
                    return;
                }

                Directory.CreateDirectory(SettingsDir);

                var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
                if (pipeline == null)
                {
                    var rendererData = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
                    if (rendererData == null)
                    {
                        rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
                        rendererData.name = "HandheldURPRenderer";
                        AssetDatabase.CreateAsset(rendererData, RendererPath);
                    }

                    pipeline = UniversalRenderPipelineAsset.Create(rendererData);
                    pipeline.name = "HandheldURP";
                    AssetDatabase.CreateAsset(pipeline, PipelinePath);
                    AssetDatabase.SaveAssets();
                }

                GraphicsSettings.defaultRenderPipeline = pipeline;

                // 품질 단계마다 따로 물어본다 — 하나만 꽂으면 단계를 바꾸는 순간 빌트인으로 돌아간다.
                int keep = QualitySettings.GetQualityLevel();
                int levels = QualitySettings.names.Length;
                for (int i = 0; i < levels; i++)
                {
                    QualitySettings.SetQualityLevel(i, false);
                    QualitySettings.renderPipeline = pipeline;
                }
                QualitySettings.SetQualityLevel(keep, false);

                AssetDatabase.SaveAssets();
                Debug.Log($"[Handheld] URP 배선 끝 — {PipelinePath} · 품질 {levels}단계 전부");
            }
            catch (Exception e)
            {
                Debug.LogError("[Handheld] URP 배선 실패: " + e.Message +
                               "\n손으로: Project Settings → Graphics → Default Render Pipeline 에 " +
                               "URP 에셋을 꽂고, Quality 의 각 단계에도 같은 것을 꽂아라.");
            }
        }

        /// <summary>씬에 글로벌 볼륨 + 피사계 심도를 놓고, 카메라에 값 전달자를 붙인다.</summary>
        [MenuItem("Handheld/URP/Add Depth of Field to Scene", false, 101)]
        public static void WireDepthOfField()
        {
            var cam = FindHandheldCamera();
            if (cam == null)
            {
                Debug.LogError("[Handheld] 씬에서 카메라를 못 찾았다 — 먼저 「Handheld/Create Test Scene」.");
                return;
            }

            // 카메라가 후처리를 그리도록 켠다. 이거 안 켜면 볼륨을 아무리 만져도 흐림이 안 나온다.
            var extra = cam.GetUniversalAdditionalCameraData();
            if (extra != null && !extra.renderPostProcessing)
            {
                extra.renderPostProcessing = true;
                EditorUtility.SetDirty(extra);
            }

            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(ProfilePath);
            if (profile == null)
            {
                Directory.CreateDirectory(SettingsDir);
                profile = ScriptableObject.CreateInstance<VolumeProfile>();
                profile.name = "HandheldVolume";
                AssetDatabase.CreateAsset(profile, ProfilePath);
            }

            if (!profile.TryGet<DepthOfField>(out var dof))
            {
                // `profile.Add<T>()` 만으로는 **파일에 안 적힌다** — 오버라이드는 프로파일의
                // 하위 에셋이라 AddObjectToAsset 을 해 줘야 한다. 안 하면 저장된 파일이
                // `components: - {fileID: 0}` 이 되고, 에디터를 다시 열면 심도가 사라진다
                // (2026-08-20 배치 실행으로 실측 — 504바이트짜리 빈 프로파일이 나왔다).
                dof = ScriptableObject.CreateInstance<DepthOfField>();
                dof.name = nameof(DepthOfField);
                dof.hideFlags = HideFlags.HideInInspector | HideFlags.HideInHierarchy;
                AssetDatabase.AddObjectToAsset(dof, profile);
                profile.components.Add(dof);
                profile.isDirty = true;
            }

            // 값은 매 프레임 카메라가 밀어 넣는다 — 여기서는 모드만 정해 둔다.
            dof.active = true;
            dof.mode.overrideState = true;
            dof.mode.value = DepthOfFieldMode.Bokeh;
            dof.focusDistance.overrideState = true;
            dof.focalLength.overrideState = true;
            dof.aperture.overrideState = true;
            EditorUtility.SetDirty(profile);

            var volumeGo = GameObject.Find("HandheldVolume");
            if (volumeGo == null)
            {
                volumeGo = new GameObject("HandheldVolume");
                Undo.RegisterCreatedObjectUndo(volumeGo, "핸드헬드 볼륨");
            }
            var volume = volumeGo.GetComponent<Volume>();
            if (volume == null) volume = volumeGo.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = 0f;
            volume.profile = profile;
            EditorUtility.SetDirty(volume);

            var driver = cam.GetComponent<HandheldDepthOfField>();
            if (driver == null) driver = cam.gameObject.AddComponent<HandheldDepthOfField>();
            driver.sourceCamera = cam;
            driver.volume = volume;
            EditorUtility.SetDirty(driver);

            AssetDatabase.SaveAssets();
            Debug.Log("[Handheld] 초점 흐림 배선 끝 — 카메라의 초점거리·초점·조리개가 그대로 보케로 간다.");
        }

        /// <summary>
        /// 핸드헬드 카메라 찾기. 리그 타입을 못 부르므로(다른 어셈블리) 이름 → MainCamera 순으로 본다.
        /// </summary>
        static Camera FindHandheldCamera()
        {
            var byName = GameObject.Find("HandheldCamera");
            if (byName != null)
            {
                var c = byName.GetComponent<Camera>();
                if (c != null) return c;
            }
            if (Camera.main != null) return Camera.main;
            var all = UnityEngine.Object.FindObjectsByType<Camera>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
            return all.Length > 0 ? all[0] : null;
        }
    }
}
#endif
