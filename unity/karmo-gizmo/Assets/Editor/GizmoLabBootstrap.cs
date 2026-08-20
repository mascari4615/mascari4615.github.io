using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Mascari4615.KarmoGizmo;

namespace GizmoLab.Editor
{
    /// <summary>
    /// One-shot setup for the lab project: creates the URP assets, assigns them, and
    /// builds the sandbox scene. Kept as a script rather than committed .asset files
    /// so the setup is reproducible and reviewable as code.
    /// </summary>
    public static class GizmoLabBootstrap
    {
        private const string SettingsFolder = "Assets/Settings";
        private const string ScenesFolder = "Assets/Scenes";
        private const string PipelinePath = SettingsFolder + "/KarmoGizmoLab_URP.asset";
        private const string RendererPath = SettingsFolder + "/KarmoGizmoLab_Renderer.asset";
        private const string ScenePath = ScenesFolder + "/Sandbox.unity";

        [MenuItem("Karmo Gizmo/Rebuild Lab Project")]
        public static void Run()
        {
            EnsureFolder(SettingsFolder);
            EnsureFolder(ScenesFolder);

            var pipeline = EnsurePipeline();
            AssignPipeline(pipeline);
            BuildSandboxScene();

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("[GizmoLab] Bootstrap complete.");
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;

            var parent = System.IO.Path.GetDirectoryName(path)?.Replace('\\', '/');
            var leaf = System.IO.Path.GetFileName(path);
            AssetDatabase.CreateFolder(parent, leaf);
        }

        private static UniversalRenderPipelineAsset EnsurePipeline()
        {
            var existing = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            if (existing != null) return existing;

            var rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
            rendererData.name = "KarmoGizmoLab_Renderer";
            AssetDatabase.CreateAsset(rendererData, RendererPath);

            var pipeline = UniversalRenderPipelineAsset.Create(rendererData);
            pipeline.name = "KarmoGizmoLab_URP";
            AssetDatabase.CreateAsset(pipeline, PipelinePath);

            return pipeline;
        }

        private static void AssignPipeline(UniversalRenderPipelineAsset pipeline)
        {
            GraphicsSettings.defaultRenderPipeline = pipeline;

            for (var i = 0; i < QualitySettings.count; i++)
            {
                QualitySettings.SetQualityLevel(i, applyExpensiveChanges: false);
                QualitySettings.renderPipeline = pipeline;
            }
        }

        private static void BuildSandboxScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.Skybox;
            camera.backgroundColor = new Color(0.13f, 0.14f, 0.17f);
            cameraObject.transform.SetPositionAndRotation(
                new Vector3(6f, 5f, -8f), Quaternion.Euler(24f, -34f, 0f));
            cameraObject.AddComponent<AudioListener>();

            var lightObject = new GameObject("Directional Light");
            var light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.shadows = LightShadows.Soft;
            lightObject.transform.rotation = Quaternion.Euler(48f, -30f, 0f);

            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground";
            ground.transform.localScale = new Vector3(3f, 1f, 3f);

            CreateCube("Cube A", new Vector3(-2.2f, 0.5f, 0f));
            CreateCube("Cube B", new Vector3(0f, 0.5f, 1.4f));
            CreateCube("Cube C", new Vector3(2.2f, 0.5f, -0.8f));

            var controllerObject = new GameObject("Gizmo Controller");
            var controller = controllerObject.AddComponent<GizmoController>();
            controller.Camera = camera;

            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);

            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        private static void CreateCube(string name, Vector3 position)
        {
            var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            cube.name = name;
            cube.transform.position = position;
        }
    }
}
