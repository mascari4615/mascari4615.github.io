using NUnit.Framework;
using UnityEngine;

namespace Mascari4615.KarmoGizmo.Tests
{
    /// <summary>
    /// The drag maths is the part that is easy to get subtly wrong and impossible to
    /// eyeball, so it is pinned down here rather than in a scene.
    /// </summary>
    public sealed class GizmoMathTests
    {
        private const float Tolerance = 1e-4f;

        [Test]
        public void ClosestPointOnLineToRay_PerpendicularRay_LandsAtItsOwnOrigin()
        {
            var line = new Ray(Vector3.zero, Vector3.right);
            var ray = new Ray(new Vector3(3f, 5f, 0f), Vector3.down);

            Assert.IsTrue(GizmoMath.ClosestPointOnLineToRay(line, ray, out var distance));
            Assert.AreEqual(3f, distance, Tolerance);
        }

        [Test]
        public void ClosestPointOnLineToRay_SkewRay_ProjectsOntoTheAxis()
        {
            var line = new Ray(Vector3.zero, Vector3.right);
            var ray = new Ray(new Vector3(-2f, 4f, 4f), new Vector3(0f, -1f, -1f).normalized);

            Assert.IsTrue(GizmoMath.ClosestPointOnLineToRay(line, ray, out var distance));
            Assert.AreEqual(-2f, distance, Tolerance);
        }

        [Test]
        public void ClosestPointOnLineToRay_ParallelRay_Refuses()
        {
            var line = new Ray(Vector3.zero, Vector3.right);
            var ray = new Ray(new Vector3(0f, 1f, 0f), Vector3.right);

            Assert.IsFalse(GizmoMath.ClosestPointOnLineToRay(line, ray, out _));
        }

        [Test]
        public void RayPlaneIntersection_HitsWhereExpected()
        {
            var ray = new Ray(new Vector3(0f, 5f, 0f), Vector3.down);

            Assert.IsTrue(GizmoMath.RayPlaneIntersection(ray, Vector3.zero, Vector3.up, out var point));
            Assert.That(Vector3.Distance(point, Vector3.zero), Is.LessThan(Tolerance));
        }

        [Test]
        public void RayPlaneIntersection_PlaneBehindTheRay_Refuses()
        {
            // Without this guard a drag would snap the object to a mirrored position
            // on the far side of the camera the moment the plane passes behind it.
            var ray = new Ray(new Vector3(0f, 5f, 0f), Vector3.up);

            Assert.IsFalse(GizmoMath.RayPlaneIntersection(ray, Vector3.zero, Vector3.up, out _));
        }

        [Test]
        public void RayPlaneIntersection_ParallelRay_Refuses()
        {
            var ray = new Ray(new Vector3(0f, 5f, 0f), Vector3.right);

            Assert.IsFalse(GizmoMath.RayPlaneIntersection(ray, Vector3.zero, Vector3.up, out _));
        }

        [Test]
        public void SignedAngleOnPlane_MeasuresAboutTheGivenAxis()
        {
            var angle = GizmoMath.SignedAngleOnPlane(Vector3.right, Vector3.forward, Vector3.up);
            Assert.AreEqual(-90f, angle, 1e-3f);
        }

        [Test]
        public void SignedAngleOnPlane_IgnoresTheComponentAlongTheAxis()
        {
            var from = new Vector3(1f, 7f, 0f);
            var to = new Vector3(0f, -3f, 1f);

            var angle = GizmoMath.SignedAngleOnPlane(from, to, Vector3.up);
            Assert.AreEqual(-90f, angle, 1e-3f);
        }

        [Test]
        public void BuildTangentBasis_ProducesAnOrthonormalFrame()
        {
            var normal = new Vector3(0.3f, -0.8f, 0.5f).normalized;

            Assert.IsTrue(GizmoMath.BuildTangentBasis(normal, out var tangent, out var bitangent));
            Assert.AreEqual(1f, tangent.magnitude, Tolerance);
            Assert.AreEqual(1f, bitangent.magnitude, Tolerance);
            Assert.AreEqual(0f, Vector3.Dot(tangent, normal), Tolerance);
            Assert.AreEqual(0f, Vector3.Dot(bitangent, normal), Tolerance);
            Assert.AreEqual(0f, Vector3.Dot(tangent, bitangent), Tolerance);
        }

        [Test]
        public void BuildTangentBasis_StraightUp_StillOrthonormal()
        {
            // The reference vector has to switch away from up here, or the cross
            // product collapses to zero.
            Assert.IsTrue(GizmoMath.BuildTangentBasis(Vector3.up, out var tangent, out var bitangent));
            Assert.AreEqual(0f, Vector3.Dot(tangent, Vector3.up), Tolerance);
            Assert.AreEqual(0f, Vector3.Dot(bitangent, Vector3.up), Tolerance);
        }

        [Test]
        public void Snap_RoundsToTheNearestStep_AndPassesThroughWhenStepIsZero()
        {
            Assert.AreEqual(2f, GizmoMath.Snap(2.4f, 1f), Tolerance);
            Assert.AreEqual(2.5f, GizmoMath.Snap(2.4f, 0.5f), Tolerance);
            Assert.AreEqual(2.4f, GizmoMath.Snap(2.4f, 0f), Tolerance);
            Assert.AreEqual(-3f, GizmoMath.Snap(-2.6f, 1f), Tolerance);
        }

        [Test]
        public void ConstantScreenSize_PerspectiveGrowsLinearlyWithDistance()
        {
            var go = new GameObject("test-camera");
            try
            {
                var camera = go.AddComponent<Camera>();
                camera.orthographic = false;
                camera.fieldOfView = 60f;
                camera.transform.position = Vector3.zero;
                camera.transform.rotation = Quaternion.identity;

                var near = GizmoMath.ConstantScreenSize(camera, new Vector3(0f, 0f, 10f), 100f);
                var far = GizmoMath.ConstantScreenSize(camera, new Vector3(0f, 0f, 20f), 100f);

                Assert.That(near, Is.GreaterThan(0f));
                Assert.AreEqual(2f, far / near, 1e-3f);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void ConstantScreenSize_OrthographicIgnoresDistance()
        {
            var go = new GameObject("test-camera");
            try
            {
                var camera = go.AddComponent<Camera>();
                camera.orthographic = true;
                camera.orthographicSize = 5f;

                var near = GizmoMath.ConstantScreenSize(camera, new Vector3(0f, 0f, 10f), 100f);
                var far = GizmoMath.ConstantScreenSize(camera, new Vector3(0f, 0f, 500f), 100f);

                Assert.AreEqual(near, far, Tolerance);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void AxisViewAlignment_IsZeroWhenTheAxisPointsAtTheCamera()
        {
            var go = new GameObject("test-camera");
            try
            {
                var camera = go.AddComponent<Camera>();
                camera.orthographic = false;
                camera.transform.position = Vector3.zero;

                var origin = new Vector3(0f, 0f, 10f);
                Assert.AreEqual(0f, GizmoMath.AxisViewAlignment(camera, origin, Vector3.forward), 1e-3f);
                Assert.AreEqual(1f, GizmoMath.AxisViewAlignment(camera, origin, Vector3.up), 1e-3f);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }
    }
}
