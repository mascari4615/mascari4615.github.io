using System.Collections.Generic;
using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Accumulates one frame of gizmo geometry into a single vertex-coloured mesh.
    /// Everything the gizmo draws is triangles - even lines, which become
    /// camera-facing ribbons - so the whole gizmo costs exactly one draw call.
    /// </summary>
    public sealed class GizmoMeshBuilder
    {
        private readonly List<Vector3> _vertices = new List<Vector3>(1024);
        private readonly List<Color> _colors = new List<Color>(1024);
        private readonly List<int> _indices = new List<int>(2048);
        private Mesh _mesh;

        public int TriangleCount => _indices.Count / 3;

        public void Clear()
        {
            _vertices.Clear();
            _colors.Clear();
            _indices.Clear();
        }

        public void AddTriangle(Vector3 a, Vector3 b, Vector3 c, Color color)
        {
            var start = _vertices.Count;

            _vertices.Add(a);
            _vertices.Add(b);
            _vertices.Add(c);
            _colors.Add(color);
            _colors.Add(color);
            _colors.Add(color);

            _indices.Add(start);
            _indices.Add(start + 1);
            _indices.Add(start + 2);
        }

        /// <summary>Two triangles, wound so the quad is visible from either side.</summary>
        public void AddQuad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Color color)
        {
            AddTriangle(a, b, c, color);
            AddTriangle(a, c, d, color);
        }

        /// <summary>
        /// A line drawn as a ribbon that always faces the camera, with its width held
        /// constant in pixels. Thin world-space lines would otherwise vanish at
        /// distance and swell up close.
        /// </summary>
        public void AddLine(Camera camera, Vector3 from, Vector3 to, Color color, float thicknessInPixels)
        {
            var direction = to - from;
            if (direction.sqrMagnitude < GizmoMath.ParallelEpsilon) return;

            var halfFrom = GizmoMath.ConstantScreenSize(camera, from, thicknessInPixels) * 0.5f;
            var halfTo = GizmoMath.ConstantScreenSize(camera, to, thicknessInPixels) * 0.5f;

            var sideFrom = RibbonSide(camera, from, direction) * halfFrom;
            var sideTo = RibbonSide(camera, to, direction) * halfTo;

            AddQuad(from - sideFrom, from + sideFrom, to + sideTo, to - sideTo, color);
        }

        public void AddCone(Vector3 baseCenter, Vector3 direction, float length, float radius, Color color, int segments = 16)
        {
            if (direction.sqrMagnitude < GizmoMath.ParallelEpsilon) return;

            direction = direction.normalized;
            GizmoMath.BuildTangentBasis(direction, out var tangent, out var bitangent);

            var tip = baseCenter + direction * length;
            var previous = baseCenter + tangent * radius;

            for (var i = 1; i <= segments; i++)
            {
                var angle = i / (float)segments * Mathf.PI * 2f;
                var current = baseCenter + (tangent * Mathf.Cos(angle) + bitangent * Mathf.Sin(angle)) * radius;

                AddTriangle(previous, current, tip, color);
                AddTriangle(current, previous, baseCenter, color);
                previous = current;
            }
        }

        public void AddCube(Vector3 center, Quaternion rotation, float size, Color color)
        {
            var half = size * 0.5f;
            var right = rotation * Vector3.right * half;
            var up = rotation * Vector3.up * half;
            var forward = rotation * Vector3.forward * half;

            AddQuad(center - right - up - forward, center + right - up - forward,
                    center + right + up - forward, center - right + up - forward, color);
            AddQuad(center - right - up + forward, center - right + up + forward,
                    center + right + up + forward, center + right - up + forward, color);
            AddQuad(center - right - up - forward, center - right + up - forward,
                    center - right + up + forward, center - right - up + forward, color);
            AddQuad(center + right - up - forward, center + right - up + forward,
                    center + right + up + forward, center + right + up - forward, color);
            AddQuad(center - right + up - forward, center + right + up - forward,
                    center + right + up + forward, center - right + up + forward, color);
            AddQuad(center - right - up - forward, center - right - up + forward,
                    center + right - up + forward, center + right - up - forward, color);
        }

        /// <summary>Filled camera-facing disc. Reads as a sphere at gizmo scale and costs far less.</summary>
        public void AddBillboardDisc(Camera camera, Vector3 center, float radius, Color color, int segments = 24)
        {
            var normal = camera != null ? -camera.transform.forward : Vector3.back;
            AddDisc(center, normal, radius, color, segments);
        }

        public void AddDisc(Vector3 center, Vector3 normal, float radius, Color color, int segments = 24)
        {
            if (!GizmoMath.BuildTangentBasis(normal, out var tangent, out var bitangent)) return;

            var previous = center + tangent * radius;
            for (var i = 1; i <= segments; i++)
            {
                var angle = i / (float)segments * Mathf.PI * 2f;
                var current = center + (tangent * Mathf.Cos(angle) + bitangent * Mathf.Sin(angle)) * radius;
                AddTriangle(center, previous, current, color);
                previous = current;
            }
        }

        public void AddCircleOutline(
            Camera camera, Vector3 center, Vector3 normal, float radius, Color color, float thicknessInPixels, int segments = 64)
        {
            AddArcOutline(camera, center, normal, StartDirection(normal), 360f, radius, color, thicknessInPixels, segments);
        }

        public void AddArcOutline(
            Camera camera,
            Vector3 center,
            Vector3 normal,
            Vector3 from,
            float angleInDegrees,
            float radius,
            Color color,
            float thicknessInPixels,
            int segments = 64)
        {
            if (!GizmoMath.BuildTangentBasis(normal, out _, out _)) return;
            if (Mathf.Abs(angleInDegrees) < 0.01f) return;

            var steps = Mathf.Max(2, Mathf.CeilToInt(segments * Mathf.Abs(angleInDegrees) / 360f));
            var start = Vector3.ProjectOnPlane(from, normal).normalized * radius;
            if (start.sqrMagnitude < GizmoMath.ParallelEpsilon) return;

            var previous = center + start;
            for (var i = 1; i <= steps; i++)
            {
                var angle = angleInDegrees * (i / (float)steps);
                var current = center + Quaternion.AngleAxis(angle, normal) * start;
                AddLine(camera, previous, current, color, thicknessInPixels);
                previous = current;
            }
        }

        public void AddArcFill(
            Vector3 center, Vector3 normal, Vector3 from, float angleInDegrees, float radius, Color color, int segments = 64)
        {
            if (Mathf.Abs(angleInDegrees) < 0.01f) return;

            var start = Vector3.ProjectOnPlane(from, normal).normalized * radius;
            if (start.sqrMagnitude < GizmoMath.ParallelEpsilon) return;

            var steps = Mathf.Max(2, Mathf.CeilToInt(segments * Mathf.Abs(angleInDegrees) / 360f));
            var previous = center + start;

            for (var i = 1; i <= steps; i++)
            {
                var angle = angleInDegrees * (i / (float)steps);
                var current = center + Quaternion.AngleAxis(angle, normal) * start;
                AddTriangle(center, previous, current, color);
                previous = current;
            }
        }

        /// <summary>Uploads the accumulated geometry. Returns null when nothing was added.</summary>
        public Mesh Build()
        {
            if (_indices.Count == 0) return null;

            if (_mesh == null)
            {
                _mesh = new Mesh { name = "KarmoGizmo", hideFlags = HideFlags.HideAndDontSave };
                _mesh.MarkDynamic();
            }

            _mesh.Clear();
            _mesh.SetVertices(_vertices);
            _mesh.SetColors(_colors);
            _mesh.SetTriangles(_indices, 0, calculateBounds: false);

            // The gizmo is always in view by construction, and recomputing tight bounds
            // every frame is pure cost, so the bounds are simply made huge.
            _mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 1e6f);
            return _mesh;
        }

        public void Dispose()
        {
            if (_mesh == null) return;

            if (Application.isPlaying) Object.Destroy(_mesh);
            else Object.DestroyImmediate(_mesh);
            _mesh = null;
        }

        private static Vector3 StartDirection(Vector3 normal)
        {
            GizmoMath.BuildTangentBasis(normal, out var tangent, out _);
            return tangent;
        }

        private static Vector3 RibbonSide(Camera camera, Vector3 point, Vector3 direction)
        {
            Vector3 viewDirection;
            if (camera == null) viewDirection = Vector3.forward;
            else if (camera.orthographic) viewDirection = camera.transform.forward;
            else viewDirection = (point - camera.transform.position).normalized;

            var side = Vector3.Cross(direction, viewDirection);
            if (side.sqrMagnitude < GizmoMath.ParallelEpsilon)
            {
                // Line points straight at the camera; any perpendicular will do.
                GizmoMath.BuildTangentBasis(direction, out side, out _);
            }

            return side.normalized;
        }
    }
}
