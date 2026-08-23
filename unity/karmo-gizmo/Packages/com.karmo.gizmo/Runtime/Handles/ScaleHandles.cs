using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>Scales along one axis, shown as a stalk with a cube on the end.</summary>
    public sealed class AxisScaleHandle : GizmoHandleBase
    {
        private Vector3 _axis;
        private float _startDistance;
        private float _lastDistance;
        private float _referenceLength;

        public AxisScaleHandle(int axisIndex)
            : base("scale.axis." + axisIndex, axisIndex, priority: 0)
        {
        }

        private static Vector3 Tip(in GizmoContext context, int axisIndex) =>
            context.Frame.Position + context.Frame.Axis(axisIndex) * (context.Frame.Size * context.Theme.AxisLength);

        public override bool TryPick(in GizmoContext context, out HandleHit hit)
        {
            hit = default;
            if (!IsUsable(context)) return false;

            var distance = GizmoMath.ScreenDistanceToSegment(
                context.Camera, context.Frame.Position, Tip(context, AxisIndex), context.ScreenPoint);
            if (distance > PickTolerance(context)) return false;

            hit = new HandleHit(this, distance, Priority);
            return true;
        }

        public override void BeginDrag(in GizmoContext context)
        {
            _axis = context.Frame.Axis(AxisIndex);
            _referenceLength = Mathf.Max(context.Frame.Size * context.Theme.AxisLength, 0.0001f);

            var axisLine = new Ray(context.Frame.Position, _axis);
            GizmoMath.ClosestPointOnLineToRay(axisLine, context.PointerRay, out _startDistance);
            _lastDistance = _startDistance;
        }

        public override TransformDelta UpdateDrag(in GizmoContext context)
        {
            var axisLine = new Ray(context.Frame.Position, _axis);
            if (GizmoMath.ClosestPointOnLineToRay(axisLine, context.PointerRay, out var distance))
            {
                _lastDistance = distance;
            }

            var travelled = _lastDistance - _startDistance;
            if (context.Has(GizmoModifiers.Precise) && context.Settings != null)
            {
                travelled *= context.Settings.PrecisionFactor;
            }

            // Dragging the handle out to twice the gizmo's length doubles the object.
            var factor = 1f + travelled / _referenceLength;
            factor = Mathf.Max(factor, context.Settings.MinimumScaleFactor);

            var scale = context.Has(GizmoModifiers.Uniform)
                ? new Vector3(factor, factor, factor)
                : ScaleOnAxis(factor);

            if (context.SnapActive && context.Snap != null)
            {
                scale = context.Snap.SnapScale(scale, context);
            }

            return TransformDelta.Resize(scale, context.Frame.Position, context.Frame.Rotation);
        }

        private Vector3 ScaleOnAxis(float factor)
        {
            var scale = Vector3.one;
            scale[AxisIndex] = factor;
            return scale;
        }

        public override void Draw(IGizmoDrawer drawer, in GizmoContext context, GizmoHandleState state)
        {
            var theme = drawer.Theme;
            var color = theme.Resolve(AxisIndex, state);
            var tip = Tip(context, AxisIndex);

            drawer.DrawLine(context.Frame.Position, tip, color, theme.LineThickness);
            drawer.DrawCube(tip, context.Frame.Rotation, context.Frame.Size * theme.CubeSize, color);
        }
    }

    /// <summary>Centre box that scales every axis together.</summary>
    public sealed class UniformScaleHandle : GizmoHandleBase
    {
        private Vector2 _startScreenPoint;
        private float _referenceLengthInPixels;

        public UniformScaleHandle()
            : base("scale.uniform", axisIndex: -1, priority: 2)
        {
        }

        public override bool TryPick(in GizmoContext context, out HandleHit hit)
        {
            hit = default;

            var center = context.Camera.WorldToScreenPoint(context.Frame.Position);
            if (center.z < 0f) return false;

            var distance = Vector2.Distance(context.ScreenPoint, new Vector2(center.x, center.y));
            var radiusInPixels = context.Settings.ScreenSizeInPixels * context.Theme.CubeSize;
            if (distance > radiusInPixels) return false;

            hit = new HandleHit(this, distance, Priority);
            return true;
        }

        public override void BeginDrag(in GizmoContext context)
        {
            _startScreenPoint = context.ScreenPoint;

            // Uniform scale has no axis to follow, so the drag is measured in pixels
            // against the gizmo's own on-screen size. That keeps the feel identical
            // whether the object is a metre away or a kilometre.
            _referenceLengthInPixels = Mathf.Max(context.Settings.ScreenSizeInPixels, 1f);
        }

        public override TransformDelta UpdateDrag(in GizmoContext context)
        {
            var travelled = Vector2.Dot(context.ScreenPoint - _startScreenPoint, Vector2.one.normalized);
            if (context.Has(GizmoModifiers.Precise) && context.Settings != null)
            {
                travelled *= context.Settings.PrecisionFactor;
            }

            var factor = 1f + travelled / _referenceLengthInPixels;
            factor = Mathf.Max(factor, context.Settings.MinimumScaleFactor);

            var scale = new Vector3(factor, factor, factor);
            if (context.SnapActive && context.Snap != null)
            {
                scale = context.Snap.SnapScale(scale, context);
            }

            return TransformDelta.Resize(scale, context.Frame.Position, context.Frame.Rotation);
        }

        public override void Draw(IGizmoDrawer drawer, in GizmoContext context, GizmoHandleState state)
        {
            var theme = drawer.Theme;
            var color = state == GizmoHandleState.Normal ? theme.ScreenAxis : theme.Resolve(-1, state);
            drawer.DrawCube(
                context.Frame.Position,
                context.Frame.Rotation,
                context.Frame.Size * theme.CubeSize * 1.4f,
                color);
        }
    }
}
