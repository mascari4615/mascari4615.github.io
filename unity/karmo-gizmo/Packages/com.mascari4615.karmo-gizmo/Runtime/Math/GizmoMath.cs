using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// The whole geometric core of the gizmo, as pure functions. Nothing here touches
    /// Unity state, so every drag behaviour can be verified in EditMode tests without
    /// a scene, a camera rig or play mode.
    /// </summary>
    public static class GizmoMath
    {
        /// <summary>Rays closer to parallel than this cannot be intersected reliably.</summary>
        public const float ParallelEpsilon = 1e-6f;

        /// <summary>
        /// Point on <paramref name="line"/> closest to <paramref name="ray"/>.
        /// This is what makes axis dragging feel right: the handle follows the pointer
        /// along its own axis rather than along the screen.
        /// </summary>
        /// <returns>False when the two are near-parallel, in which case the caller keeps its last value.</returns>
        public static bool ClosestPointOnLineToRay(Ray line, Ray ray, out float lineDistance)
        {
            var lineDir = line.direction;
            var rayDir = ray.direction;

            var dotLR = Vector3.Dot(lineDir, rayDir);
            var denominator = 1f - dotLR * dotLR;
            if (Mathf.Abs(denominator) < ParallelEpsilon)
            {
                lineDistance = 0f;
                return false;
            }

            var delta = ray.origin - line.origin;
            var dotDL = Vector3.Dot(delta, lineDir);
            var dotDR = Vector3.Dot(delta, rayDir);

            lineDistance = (dotDL - dotLR * dotDR) / denominator;
            return true;
        }

        /// <summary>Where <paramref name="ray"/> meets the plane through <paramref name="planeOrigin"/>.</summary>
        public static bool RayPlaneIntersection(Ray ray, Vector3 planeOrigin, Vector3 planeNormal, out Vector3 point)
        {
            var denominator = Vector3.Dot(ray.direction, planeNormal);
            if (Mathf.Abs(denominator) < ParallelEpsilon)
            {
                point = Vector3.zero;
                return false;
            }

            var distance = Vector3.Dot(planeOrigin - ray.origin, planeNormal) / denominator;
            if (distance < 0f)
            {
                // The plane is behind the viewer; refuse rather than snap the object
                // to a mirrored position on the far side of the camera.
                point = Vector3.zero;
                return false;
            }

            point = ray.origin + ray.direction * distance;
            return true;
        }

        /// <summary>
        /// Pixel distance from <paramref name="screenPoint"/> to the projected segment
        /// a-b. Picking thin axes by screen distance is far more forgiving than fitting
        /// colliders around them, and it stays honest at any zoom level.
        /// </summary>
        public static float ScreenDistanceToSegment(Camera camera, Vector3 a, Vector3 b, Vector2 screenPoint)
        {
            var screenA = WorldToScreen(camera, a);
            var screenB = WorldToScreen(camera, b);
            return DistanceToSegment2D(screenPoint, screenA, screenB);
        }

        /// <summary>Pixel distance to the projected outline of a disc, used by rotation rings.</summary>
        public static float ScreenDistanceToDisc(
            Camera camera, Vector3 center, Vector3 normal, float radius, Vector2 screenPoint, int segments = 48)
        {
            if (segments < 3) segments = 3;

            var basis = BuildTangentBasis(normal, out var tangent, out var bitangent);
            if (!basis) return float.MaxValue;

            var best = float.MaxValue;
            var previous = center + tangent * radius;
            for (var i = 1; i <= segments; i++)
            {
                var angle = i / (float)segments * Mathf.PI * 2f;
                var current = center + (tangent * Mathf.Cos(angle) + bitangent * Mathf.Sin(angle)) * radius;
                var distance = ScreenDistanceToSegment(camera, previous, current, screenPoint);
                if (distance < best) best = distance;
                previous = current;
            }

            return best;
        }

        /// <summary>
        /// World-space size that keeps a handle a constant number of pixels tall,
        /// whichever way the camera is projecting.
        /// </summary>
        public static float ConstantScreenSize(Camera camera, Vector3 worldPosition, float pixelSize)
        {
            if (camera == null) return 1f;

            if (camera.orthographic)
            {
                // Orthographic height maps directly to pixels, independent of distance.
                return camera.orthographicSize * 2f * (pixelSize / Mathf.Max(1, camera.pixelHeight));
            }

            var toPoint = worldPosition - camera.transform.position;
            var depth = Vector3.Dot(toPoint, camera.transform.forward);
            depth = Mathf.Max(Mathf.Abs(depth), 0.0001f);

            var worldHeightAtDepth = 2f * depth * Mathf.Tan(camera.fieldOfView * 0.5f * Mathf.Deg2Rad);
            return worldHeightAtDepth * (pixelSize / Mathf.Max(1, camera.pixelHeight));
        }

        /// <summary>
        /// Signed angle in degrees from <paramref name="from"/> to <paramref name="to"/>
        /// measured in the plane whose normal is <paramref name="axis"/>.
        /// </summary>
        public static float SignedAngleOnPlane(Vector3 from, Vector3 to, Vector3 axis)
        {
            var flatFrom = Vector3.ProjectOnPlane(from, axis);
            var flatTo = Vector3.ProjectOnPlane(to, axis);
            if (flatFrom.sqrMagnitude < ParallelEpsilon || flatTo.sqrMagnitude < ParallelEpsilon) return 0f;
            return Vector3.SignedAngle(flatFrom, flatTo, axis);
        }

        /// <summary>
        /// How square-on the camera sees an axis, 0 (edge-on) to 1 (face-on). Handles
        /// that are nearly parallel to the view direction are unusable, so tools fade
        /// and de-prioritise them instead of letting the user grab a degenerate axis.
        /// </summary>
        public static float AxisViewAlignment(Camera camera, Vector3 origin, Vector3 axis)
        {
            if (camera == null) return 1f;

            Vector3 viewDirection;
            if (camera.orthographic)
            {
                viewDirection = camera.transform.forward;
            }
            else
            {
                viewDirection = origin - camera.transform.position;
                if (viewDirection.sqrMagnitude < ParallelEpsilon) return 1f;
                viewDirection.Normalize();
            }

            return 1f - Mathf.Abs(Vector3.Dot(viewDirection, axis.normalized));
        }

        /// <summary>Two unit vectors spanning the plane with the given normal.</summary>
        public static bool BuildTangentBasis(Vector3 normal, out Vector3 tangent, out Vector3 bitangent)
        {
            if (normal.sqrMagnitude < ParallelEpsilon)
            {
                tangent = Vector3.right;
                bitangent = Vector3.up;
                return false;
            }

            normal = normal.normalized;
            var reference = Mathf.Abs(normal.y) < 0.99f ? Vector3.up : Vector3.right;
            tangent = Vector3.Normalize(Vector3.Cross(reference, normal));
            bitangent = Vector3.Cross(normal, tangent);
            return true;
        }

        /// <summary>Rounds to the nearest multiple, leaving the value alone when step is zero.</summary>
        public static float Snap(float value, float step) =>
            step > 0f ? Mathf.Round(value / step) * step : value;

        /// <summary>Per-component <see cref="Snap(float,float)"/>.</summary>
        public static Vector3 Snap(Vector3 value, Vector3 step) => new Vector3(
            Snap(value.x, step.x),
            Snap(value.y, step.y),
            Snap(value.z, step.z));

        private static Vector2 WorldToScreen(Camera camera, Vector3 world)
        {
            if (camera == null) return Vector2.zero;

            var point = camera.WorldToScreenPoint(world);
            if (point.z < 0f)
            {
                // Behind the camera: mirror it so segment clipping stays monotonic
                // rather than folding the projected line back on itself.
                point.x = camera.pixelWidth - point.x;
                point.y = camera.pixelHeight - point.y;
            }

            return new Vector2(point.x, point.y);
        }

        private static float DistanceToSegment2D(Vector2 point, Vector2 a, Vector2 b)
        {
            var segment = b - a;
            var lengthSquared = segment.sqrMagnitude;
            if (lengthSquared < ParallelEpsilon) return Vector2.Distance(point, a);

            var t = Mathf.Clamp01(Vector2.Dot(point - a, segment) / lengthSquared);
            return Vector2.Distance(point, a + segment * t);
        }
    }
}
