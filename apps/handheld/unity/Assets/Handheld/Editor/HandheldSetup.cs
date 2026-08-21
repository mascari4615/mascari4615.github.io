using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Handheld.EditorTools
{
    /// <summary>
    /// 테스트 씬을 코드로 짓는다 — 씬 파일을 손으로 쓰지 않는다.
    /// 메뉴: Handheld / 테스트 씬 만들기 (배치 모드에서는 -executeMethod 로).
    /// TASK-KAR-230.
    /// </summary>
    public static class HandheldSetup
    {
        const string ScenePath = "Assets/Scenes/Handheld.unity";

        [MenuItem("Handheld/테스트 씬 만들기")]
        public static void BuildScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // ── 빛 ───────────────────────────────────────────────────────────────
            var sun = new GameObject("Directional Light");
            var light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.shadows = LightShadows.Soft;
            light.color = new Color(1f, 0.97f, 0.9f);
            sun.transform.rotation = Quaternion.Euler(48f, -35f, 0f);

            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.32f, 0.40f, 0.55f);
            RenderSettings.ambientEquatorColor = new Color(0.22f, 0.24f, 0.30f);
            RenderSettings.ambientGroundColor = new Color(0.10f, 0.10f, 0.12f);

            // ── 서버 ─────────────────────────────────────────────────────────────
            var serverGo = new GameObject("HandheldServer");
            var server = serverGo.AddComponent<HandheldServer>();
            server.autoRecord = true;      // 「튄다」는 드물다 — 늘 켜 둔다 (CSV 두 줄, 값이 싸다)

            // WebRTC 는 서버 옆에 둔다 — 시그널링이 같은 WS 를 타므로 짝이다.
            // 없어도 MJPEG 으로 다 돌아간다(폴백이 본체가 아니라 본체가 늘 있는 길이다).
            var rtc = serverGo.AddComponent<HandheldWebRtc>();
            rtc.server = server;
            server.webrtc = rtc;

            // ── 리그 (원점) + 카메라 ──────────────────────────────────────────────
            var root = new GameObject("HandheldRoot");
            root.transform.position = new Vector3(0f, 1.4f, -3f); // 사람 눈높이, 무대에서 3m 뒤

            var camGo = new GameObject("HandheldCamera");
            camGo.transform.SetParent(root.transform, false);
            var cam = camGo.AddComponent<Camera>();
            cam.nearClipPlane = 0.03f;
            cam.farClipPlane = 200f;
            cam.clearFlags = CameraClearFlags.Skybox;
            cam.tag = "MainCamera";

            var rig = camGo.AddComponent<HandheldRig>();
            rig.server = server;
            rig.rigRoot = root.transform;
            rtc.rig = rig;

            // ── 무대: 거리감을 눈으로 재는 물건들 ─────────────────────────────────
            BuildStage();

            // URP 가 깔려 있으면 초점 흐림까지 붙여 둔다 — 없으면 조용히 건너뛴다
            // (리그는 파이프라인 없이도 초점 「값」은 계속 낸다).
            if (HandheldUrpInstaller.UrpInstalled)
                EditorApplication.ExecuteMenuItem("Handheld/URP/씬에 초점 흐림 붙이기");

            EditorSceneManager.MarkSceneDirty(scene);
            System.IO.Directory.CreateDirectory("Assets/Scenes");
            EditorSceneManager.SaveScene(scene, ScenePath);
            AssetDatabase.SaveAssets();
            Debug.Log($"[Handheld] 테스트 씬 완성: {ScenePath}");
        }

        static void BuildStage()
        {
            var stage = new GameObject("Stage");

            // 바닥 — 1m 격자가 보이게 타일 두 색을 번갈아 깐다 (6DoF 이동을 눈으로 잰다)
            var floor = new GameObject("Floor");
            floor.transform.SetParent(stage.transform, false);
            var a = Mat(new Color(0.16f, 0.17f, 0.20f));
            var b = Mat(new Color(0.22f, 0.24f, 0.28f));
            for (int x = -6; x <= 6; x++)
                for (int z = -6; z <= 6; z++)
                {
                    var tile = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    tile.name = $"Tile {x},{z}";
                    tile.transform.SetParent(floor.transform, false);
                    tile.transform.localPosition = new Vector3(x, -0.05f, z);
                    tile.transform.localScale = new Vector3(0.98f, 0.1f, 0.98f);
                    Renderer(tile).sharedMaterial = ((x + z) & 1) == 0 ? a : b;
                }

            // 깊이 기둥 — 1·2·4·8m 에 세운다. 폰을 옮기면 시차(parallax)가 바로 보인다.
            float[] depths = { 1f, 2f, 4f, 8f };
            Color[] cols = {
                new Color(1f, 0.42f, 0.42f), new Color(1f, 0.78f, 0.35f),
                new Color(0.45f, 0.85f, 0.55f), new Color(0.5f, 0.72f, 1f),
            };
            for (int i = 0; i < depths.Length; i++)
            {
                var pillar = GameObject.CreatePrimitive(PrimitiveType.Cube);
                pillar.name = $"Pillar {depths[i]}m";
                pillar.transform.SetParent(stage.transform, false);
                pillar.transform.localPosition = new Vector3(i % 2 == 0 ? -0.9f : 0.9f, 0.6f, depths[i] - 3f);
                pillar.transform.localScale = new Vector3(0.18f, 1.2f, 0.18f);
                Renderer(pillar).sharedMaterial = Mat(cols[i]);
            }

            // 1m 정육면체 = 크기의 기준자
            var meter = GameObject.CreatePrimitive(PrimitiveType.Cube);
            meter.name = "1m Cube (기준자)";
            meter.transform.SetParent(stage.transform, false);
            meter.transform.localPosition = new Vector3(0f, 0.5f, 0f);
            Renderer(meter).sharedMaterial = Mat(new Color(0.86f, 0.86f, 0.90f));

            // 얼굴 자리 — 아바타 세울 곳 표시용 구
            var head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            head.name = "Subject (아바타 자리)";
            head.transform.SetParent(stage.transform, false);
            head.transform.localPosition = new Vector3(0f, 1.5f, 1.2f);
            head.transform.localScale = Vector3.one * 0.24f;
            Renderer(head).sharedMaterial = Mat(new Color(1f, 0.62f, 0.78f));
        }

        static Renderer Renderer(GameObject go) => go.GetComponent<Renderer>();

        /// <summary>
        /// 지금 파이프라인에 맞는 기본 셰이더. URP 면 URP Lit, 아니면 빌트인 Standard.
        /// 이걸 안 갈면 URP 로 바꾼 순간 무대가 통째로 분홍이 된다.
        /// </summary>
        static Shader LitShader()
        {
            var s = Shader.Find("Universal Render Pipeline/Lit");
            return s != null ? s : Shader.Find("Standard");
        }

        static Material Mat(Color c)
        {
            var m = new Material(LitShader()) { color = c };
            // 이름이 파이프라인마다 다르다 — 있는 것만 만진다.
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.15f);
            if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.15f);
            return m;
        }

        /// <summary>테스트 씬을 연다 (없으면 짓는다).</summary>
        public static void OpenScene()
        {
            if (!System.IO.File.Exists(ScenePath)) { BuildScene(); return; }
            EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        }

        /// <summary>
        /// 씬을 열고 바로 Play 로 들어간다 (-executeMethod ...HandheldSetup.OpenAndPlay).
        /// 서버가 실제로 뜨는지 밖에서 확인할 때 쓴다.
        /// </summary>
        public static void OpenAndPlay()
        {
            if (!System.IO.File.Exists(ScenePath)) BuildScene();
            EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            EditorApplication.EnterPlaymode();
        }

        [MenuItem("Handheld/씬 열고 Play")]
        static void OpenAndPlayMenu() => OpenAndPlay();

        /// <summary>배치 모드 진입점 (-executeMethod Handheld.EditorTools.HandheldSetup.BuildSceneBatch).</summary>
        public static void BuildSceneBatch()
        {
            BuildScene();
            EditorApplication.Exit(0);
        }
    }
}
