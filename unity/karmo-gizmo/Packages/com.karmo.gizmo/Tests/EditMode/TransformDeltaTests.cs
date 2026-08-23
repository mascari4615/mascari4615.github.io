using NUnit.Framework;
using UnityEngine;

namespace Mascari4615.KarmoGizmo.Tests
{
    /// <summary>
    /// Replaying a delta onto a snapshot is what every drag ultimately does, so the
    /// pivot behaviour is pinned here.
    /// </summary>
    public sealed class TransformDeltaTests
    {
        private const float Tolerance = 1e-4f;

        private GameObject _go;
        private IGizmoTarget _target;

        [SetUp]
        public void SetUp()
        {
            _go = new GameObject("delta-target");
            _target = new TransformGizmoTarget(_go.transform);
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_go);
        }

        [Test]
        public void Translate_MovesFromTheSnapshotNotFromWhereverItIsNow()
        {
            _go.transform.position = new Vector3(1f, 2f, 3f);
            var snapshot = new TargetSnapshot(_target);

            // Two frames of the same drag must not compound: the second replay is an
            // absolute restatement, not an increment.
            TransformDelta.Translate(new Vector3(5f, 0f, 0f)).ApplyTo(snapshot);
            TransformDelta.Translate(new Vector3(5f, 0f, 0f)).ApplyTo(snapshot);

            Assert.That(Vector3.Distance(_go.transform.position, new Vector3(6f, 2f, 3f)), Is.LessThan(Tolerance));
        }

        [Test]
        public void Rotate_SwingsThePositionAroundThePivot()
        {
            _go.transform.position = new Vector3(2f, 0f, 0f);
            var snapshot = new TargetSnapshot(_target);

            TransformDelta.Rotate(Quaternion.AngleAxis(90f, Vector3.up), Vector3.zero).ApplyTo(snapshot);

            Assert.That(Vector3.Distance(_go.transform.position, new Vector3(0f, 0f, -2f)), Is.LessThan(1e-3f));
        }

        [Test]
        public void Rotate_AboutTheObjectsOwnOrigin_LeavesPositionAlone()
        {
            _go.transform.position = new Vector3(2f, 3f, 4f);
            var snapshot = new TargetSnapshot(_target);

            TransformDelta.Rotate(Quaternion.AngleAxis(45f, Vector3.up), _go.transform.position).ApplyTo(snapshot);

            Assert.That(Vector3.Distance(_go.transform.position, new Vector3(2f, 3f, 4f)), Is.LessThan(1e-3f));
            Assert.AreEqual(45f, Quaternion.Angle(Quaternion.identity, _go.transform.rotation), 1e-2f);
        }

        [Test]
        public void Resize_ScalesTheObjectAndPushesItAwayFromThePivot()
        {
            _go.transform.position = new Vector3(2f, 0f, 0f);
            _go.transform.localScale = Vector3.one;
            var snapshot = new TargetSnapshot(_target);

            TransformDelta.Resize(new Vector3(2f, 1f, 1f), Vector3.zero, Quaternion.identity).ApplyTo(snapshot);

            Assert.AreEqual(4f, _go.transform.position.x, Tolerance);
            Assert.AreEqual(2f, _go.transform.localScale.x, Tolerance);
            Assert.AreEqual(1f, _go.transform.localScale.y, Tolerance);
        }

        [Test]
        public void Identity_ChangesNothing()
        {
            _go.transform.position = new Vector3(1f, 2f, 3f);
            _go.transform.rotation = Quaternion.Euler(10f, 20f, 30f);
            _go.transform.localScale = new Vector3(1f, 2f, 3f);
            var snapshot = new TargetSnapshot(_target);

            TransformDelta.Identity.ApplyTo(snapshot);

            Assert.That(Vector3.Distance(_go.transform.position, new Vector3(1f, 2f, 3f)), Is.LessThan(Tolerance));
            Assert.That(Vector3.Distance(_go.transform.localScale, new Vector3(1f, 2f, 3f)), Is.LessThan(Tolerance));
            Assert.IsTrue(TransformDelta.Identity.IsIdentity);
        }

        [Test]
        public void Snapshot_Restore_PutsEverythingBack()
        {
            _go.transform.position = new Vector3(1f, 2f, 3f);
            _go.transform.rotation = Quaternion.Euler(10f, 20f, 30f);
            _go.transform.localScale = new Vector3(2f, 2f, 2f);
            var snapshot = new TargetSnapshot(_target);

            _go.transform.position = Vector3.zero;
            _go.transform.rotation = Quaternion.identity;
            _go.transform.localScale = Vector3.one;

            snapshot.Restore();

            Assert.That(Vector3.Distance(_go.transform.position, new Vector3(1f, 2f, 3f)), Is.LessThan(Tolerance));
            Assert.That(Vector3.Distance(_go.transform.localScale, new Vector3(2f, 2f, 2f)), Is.LessThan(Tolerance));
        }
    }
}
