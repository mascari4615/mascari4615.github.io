using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Mascari4615.KarmoGizmo.Tests
{
    /// <summary>
    /// Input the test drives by hand. This is the whole point of
    /// <see cref="IGizmoInput"/> being an interface: a drag can be replayed exactly,
    /// with no mouse and no human.
    /// </summary>
    public sealed class ScriptedGizmoInput : IGizmoInput
    {
        public Vector2 Position;
        public bool Pressed;
        public bool Held;
        public bool Released;
        public GizmoModifiers Modifiers;
        public bool Cancel;

        public string RequestedToolId { get; set; }
        public bool RequestedSpaceToggle { get; set; }
        public bool RequestedUndo { get; set; }
        public bool RequestedRedo { get; set; }

        public GizmoPointerState Poll(Camera camera) =>
            new GizmoPointerState(Position, Pressed, Held, Released, Modifiers, Cancel);

        public Ray GetPointerRay(Camera camera, Vector2 screenPosition) =>
            camera.ScreenPointToRay(screenPosition);

        /// <summary>Press without releasing.</summary>
        public void Press(Vector2 position)
        {
            Position = position;
            Pressed = true;
            Held = true;
            Released = false;
        }

        /// <summary>Keep holding at a new position.</summary>
        public void MoveTo(Vector2 position)
        {
            Position = position;
            Pressed = false;
            Held = true;
            Released = false;
        }

        public void Release(Vector2 position)
        {
            Position = position;
            Pressed = false;
            Held = false;
            Released = true;
        }

        public void Idle()
        {
            Pressed = false;
            Held = false;
            Released = false;
            RequestedToolId = null;
            RequestedSpaceToggle = false;
            RequestedUndo = false;
            RequestedRedo = false;
        }
    }

    public sealed class GizmoDragTests
    {
        private GameObject _cameraObject;
        private GameObject _cube;
        private GameObject _controllerObject;
        private Camera _camera;
        private GizmoController _controller;
        private ScriptedGizmoInput _input;

        [SetUp]
        public void SetUp()
        {
            _cameraObject = new GameObject("camera");
            _camera = _cameraObject.AddComponent<Camera>();
            _camera.transform.SetPositionAndRotation(new Vector3(0f, 3f, -8f), Quaternion.Euler(15f, 0f, 0f));

            _cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            _cube.transform.position = Vector3.zero;

            _controllerObject = new GameObject("gizmo");
            _controller = _controllerObject.AddComponent<GizmoController>();
            _controller.Camera = _camera;

            _input = new ScriptedGizmoInput();
            _controller.Input = _input;
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_controllerObject);
            Object.DestroyImmediate(_cube);
            Object.DestroyImmediate(_cameraObject);
        }

        private Vector2 ScreenPointOf(Vector3 world)
        {
            var point = _camera.WorldToScreenPoint(world);
            return new Vector2(point.x, point.y);
        }

        /// <summary>Where the X arrow sits on screen, halfway along its shaft.</summary>
        private Vector2 XAxisHandleScreenPoint()
        {
            var pivot = _cube.transform.position;
            var size = GizmoMath.ConstantScreenSize(_camera, pivot, _controller.Settings.ScreenSizeInPixels);
            return ScreenPointOf(pivot + Vector3.right * (size * 0.5f));
        }

        [UnityTest]
        public IEnumerator ClickingACube_SelectsIt()
        {
            _input.Press(ScreenPointOf(_cube.transform.position));
            yield return null;

            Assert.AreEqual(1, _controller.Selection.Count);
            Assert.AreSame(_cube.transform, ((TransformGizmoTarget)_controller.Selection.Active).Transform);
        }

        [UnityTest]
        public IEnumerator DraggingTheXAxis_MovesTheCubeAlongXOnly()
        {
            _controller.Selection.Set(new TransformGizmoTarget(_cube.transform));
            _controller.SetTool(GizmoToolIds.Move);
            yield return null;

            var grab = XAxisHandleScreenPoint();
            _input.Press(grab);
            yield return null;

            Assert.IsTrue(_controller.IsDragging, "the X axis handle was not grabbed");

            _input.MoveTo(grab + new Vector2(120f, 0f));
            yield return null;

            var moved = _cube.transform.position;
            Assert.That(moved.x, Is.GreaterThan(0.5f), "the cube did not travel along X");
            Assert.That(Mathf.Abs(moved.y), Is.LessThan(1e-3f), "the drag leaked into Y");
            Assert.That(Mathf.Abs(moved.z), Is.LessThan(1e-3f), "the drag leaked into Z");

            _input.Release(_input.Position);
            yield return null;

            Assert.IsFalse(_controller.IsDragging);
        }

        [UnityTest]
        public IEnumerator CancellingADrag_PutsTheCubeBack()
        {
            _controller.Selection.Set(new TransformGizmoTarget(_cube.transform));
            _controller.SetTool(GizmoToolIds.Move);
            yield return null;

            var grab = XAxisHandleScreenPoint();
            _input.Press(grab);
            yield return null;
            _input.MoveTo(grab + new Vector2(120f, 0f));
            yield return null;

            Assert.That(_cube.transform.position.x, Is.GreaterThan(0.5f));

            _input.Cancel = true;
            yield return null;
            _input.Cancel = false;

            Assert.That(Vector3.Distance(_cube.transform.position, Vector3.zero), Is.LessThan(1e-3f));
            Assert.IsFalse(_controller.IsDragging);
        }

        [UnityTest]
        public IEnumerator UndoAfterADrag_RestoresThePreviousPosition()
        {
            _controller.Selection.Set(new TransformGizmoTarget(_cube.transform));
            _controller.SetTool(GizmoToolIds.Move);
            yield return null;

            var grab = XAxisHandleScreenPoint();
            _input.Press(grab);
            yield return null;
            _input.MoveTo(grab + new Vector2(120f, 0f));
            yield return null;
            _input.Release(_input.Position);
            yield return null;

            Assert.That(_cube.transform.position.x, Is.GreaterThan(0.5f));

            _input.Idle();
            _input.RequestedUndo = true;
            yield return null;
            _input.RequestedUndo = false;

            Assert.That(Vector3.Distance(_cube.transform.position, Vector3.zero), Is.LessThan(1e-3f));
        }

        [UnityTest]
        public IEnumerator RotatingAboutY_TurnsTheCubeWithoutMovingIt()
        {
            _controller.Selection.Set(new TransformGizmoTarget(_cube.transform));
            _controller.SetTool(GizmoToolIds.Rotate);
            yield return null;

            var pivot = _cube.transform.position;
            var size = GizmoMath.ConstantScreenSize(_camera, pivot, _controller.Settings.ScreenSizeInPixels);

            // Grab the Y ring where it crosses the world X axis.
            var grab = ScreenPointOf(pivot + Vector3.right * size);
            _input.Press(grab);
            yield return null;

            Assert.IsTrue(_controller.IsDragging, "the Y rotation ring was not grabbed");

            _input.MoveTo(grab + new Vector2(0f, 80f));
            yield return null;

            Assert.That(Quaternion.Angle(Quaternion.identity, _cube.transform.rotation), Is.GreaterThan(1f));
            Assert.That(Vector3.Distance(_cube.transform.position, pivot), Is.LessThan(1e-3f));

            _input.Release(_input.Position);
            yield return null;
        }

        [UnityTest]
        public IEnumerator ScalingTheXAxis_GrowsOnlyThatAxis()
        {
            _controller.Selection.Set(new TransformGizmoTarget(_cube.transform));
            _controller.SetTool(GizmoToolIds.Scale);
            yield return null;

            var grab = XAxisHandleScreenPoint();
            _input.Press(grab);
            yield return null;

            Assert.IsTrue(_controller.IsDragging, "the X scale handle was not grabbed");

            _input.MoveTo(grab + new Vector2(100f, 0f));
            yield return null;

            var scale = _cube.transform.localScale;
            Assert.That(scale.x, Is.GreaterThan(1.05f));
            Assert.AreEqual(1f, scale.y, 1e-3f);
            Assert.AreEqual(1f, scale.z, 1e-3f);

            _input.Release(_input.Position);
            yield return null;
        }
    }
}
