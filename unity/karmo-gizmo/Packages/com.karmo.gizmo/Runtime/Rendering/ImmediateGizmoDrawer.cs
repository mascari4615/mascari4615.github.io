using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Default <see cref="IGizmoDrawer"/>. Batches the frame into one vertex-coloured
    /// mesh and submits it through <see cref="Graphics.DrawMesh"/>, which the built-in
    /// pipeline and every SRP both honour - so the package needs no URP or HDRP
    /// assembly reference and no renderer feature to be installed.
    /// </summary>
    public sealed class ImmediateGizmoDrawer : IGizmoDrawer
    {
        private const string ShaderName = "Hidden/KarmoGizmo/Unlit";

        private readonly GizmoMeshBuilder _builder = new GizmoMeshBuilder();
        private Material _material;

        public ImmediateGizmoDrawer(GizmoTheme theme)
        {
            Theme = theme;
        }

        public GizmoTheme Theme { get; set; }
        public Camera Camera { get; private set; }

        /// <summary>Layer the gizmo mesh is submitted on, in case a project culls per camera.</summary>
        public int Layer { get; set; }

        /// <summary>Draw through solid geometry. On by default - a hidden handle is a lost handle.</summary>
        public bool DrawThroughGeometry { get; set; } = true;

        public void Begin(Camera camera)
        {
            Camera = camera;
            _builder.Clear();
        }

        /// <summary>Submits everything accumulated since <see cref="Begin"/>.</summary>
        public void End()
        {
            var mesh = _builder.Build();
            if (mesh == null || Camera == null) return;

            Graphics.DrawMesh(
                mesh,
                Matrix4x4.identity,
                ResolveMaterial(),
                Layer,
                Camera,
                submeshIndex: 0,
                properties: null,
                castShadows: false,
                receiveShadows: false,
                useLightProbes: false);
        }

        public void DrawLine(Vector3 from, Vector3 to, Color color, float thickness) =>
            _builder.AddLine(Camera, from, to, color, thickness);

        public void DrawCone(Vector3 baseCenter, Vector3 direction, float length, float radius, Color color) =>
            _builder.AddCone(baseCenter, direction, length, radius, color);

        public void DrawCube(Vector3 center, Quaternion rotation, float size, Color color) =>
            _builder.AddCube(center, rotation, size, color);

        public void DrawSphere(Vector3 center, float radius, Color color) =>
            _builder.AddBillboardDisc(Camera, center, radius, color);

        public void DrawCircle(Vector3 center, Vector3 normal, float radius, Color color, float thickness) =>
            _builder.AddCircleOutline(Camera, center, normal, radius, color, thickness);

        public void DrawArc(
            Vector3 center, Vector3 normal, Vector3 from, float angleInDegrees, float radius, Color color, bool filled)
        {
            if (filled) _builder.AddArcFill(center, normal, from, angleInDegrees, radius, color);
            else _builder.AddArcOutline(Camera, center, normal, from, angleInDegrees, radius, color, Theme.LineThickness);
        }

        public void DrawQuad(Vector3 center, Vector3 axisA, Vector3 axisB, float size, Color fill, Color outline)
        {
            var half = size * 0.5f;
            var a = center - axisA * half - axisB * half;
            var b = center + axisA * half - axisB * half;
            var c = center + axisA * half + axisB * half;
            var d = center - axisA * half + axisB * half;

            _builder.AddQuad(a, b, c, d, fill);

            var thickness = Theme != null ? Theme.LineThickness : 2f;
            _builder.AddLine(Camera, a, b, outline, thickness);
            _builder.AddLine(Camera, b, c, outline, thickness);
            _builder.AddLine(Camera, c, d, outline, thickness);
            _builder.AddLine(Camera, d, a, outline, thickness);
        }

        public void Dispose()
        {
            _builder.Dispose();
            if (_material == null) return;

            if (Application.isPlaying) Object.Destroy(_material);
            else Object.DestroyImmediate(_material);
            _material = null;
        }

        private Material ResolveMaterial()
        {
            if (_material != null)
            {
                _material.SetInt("_ZTest", (int)(DrawThroughGeometry
                    ? UnityEngine.Rendering.CompareFunction.Always
                    : UnityEngine.Rendering.CompareFunction.LessEqual));
                return _material;
            }

            var shader = Shader.Find(ShaderName);
            if (shader == null)
            {
                Debug.LogError(
                    $"[KarmoGizmo] Shader '{ShaderName}' was not found. " +
                    "It ships with the package - check that the package folder is intact " +
                    "and that the shader is included in Always Included Shaders for stripped builds.");
                shader = Shader.Find("Sprites/Default");
            }

            _material = new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
            return _material;
        }
    }
}
