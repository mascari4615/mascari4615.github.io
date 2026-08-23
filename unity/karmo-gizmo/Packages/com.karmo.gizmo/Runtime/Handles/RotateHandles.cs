using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Shared drag maths for anything that turns about an axis. The angle is
    /// accumulated across frames rather than measured absolutely, so a drag can wind
    /// past 180 degrees and keep going instead of flipping sign.
    /// </summary>
    public abstract class RotateHandleBase : GizmoHandleBase
    {
        private Vector3 _axis;
        private Vector3 _startDirection;
        private float _lastRawAngle;
        private float _accumulated;
        private bool _hasStart;

        protected RotateHandleBase(string id, int axisIndex, int priority)
            : base(id, axisIndex, priority)
        {
        }

        /// <summary>Total turn since the drag began, before snapping. Handy for read-outs.</summary>
        public float AccumulatedAngle => _accumulated;

        /// <summary>World-space axis this handle turns about.</summary>
        protected abstract Vector3 ResolveAxis(in GizmoContext context);

        /// <summary>Ring radius in world units.</summary>
        protected abstract float ResolveRadius(in GizmoContext context);

        public override bool TryPick(in GizmoContext context, out HandleHit hit)
        {
            hit = default;
            if (!IsUsable(context)) return false;

            var axis = ResolveAxis(context);
            var distance = GizmoMath.ScreenDistanceToDisc(
                context.Camera, context.Frame.Position, axis, ResolveRadius(context), context.ScreenPoint);
            if (distance > PickTolerance(context)) return false;

            hit = new HandleHit(this, distance, Priority);
            return true;
        }

        public override void BeginDrag(in GizmoContext context)
        {
            _axis = ResolveAxis(context);
            _accumulated = 0f;
            _lastRawAngle = 0f;

            _hasStart = TryGetDirection(context, out _startDirection);
        }

        public override TransformDelta UpdateDrag(in GizmoContext context)
        {
            if (!_hasStart) return TransformDelta.Identity;

            if (TryGetDirection(context, out var current))
            {
                var raw = GizmoMath.SignedAngleOnPlane(_startDirection, current, _axis);

                // DeltaAngle keeps the accumulation continuous across the +-180 seam.
                _accumulated += Mathf.DeltaAngle(_lastRawAngle, raw);
                _lastRawAngle = raw;
            }

            var angle = _accumulated;
            if (context.Has(GizmoModifiers.Precise) && context.Settings != null)
            {
                angle *= context.Settings.PrecisionFactor;
            }

            if (context.SnapActive && context.Snap != null)
            {
                angle = context.Snap.SnapAngle(angle, _axis, context);
            }

            return TransformDelta.Rotate(Quaternion.AngleAxis(angle, _axis), context.Frame.Position);
        }

        private bool TryGetDirection(in GizmoContext context, out Vector3 direction)
        {
            direction = Vector3.zero;
            if (!GizmoMath.RayPlaneIntersection(context.PointerRay, context.Frame.Position, _axis, out var point))
            {
                return false;
            }

            direction = point - context.Frame.Position;
            return direction.sqrMagnitude > GizmoMath.ParallelEpsilon;
        }
    }

    /// <summary>Ring that turns about one axis of the gizmo frame.</summary>
    public sealed class AxisRotateHandle : RotateHandleBase
    {
        public AxisRotateHandle(int axisIndex)
            : base("rotate.axis." + axisIndex, axisIndex, priority: 0)
        {
        }

        /// <summary>A ring seen edge-on is still perfectly draggable, unlike an arrow.</summary>
        protected override float MinimumViewAlignment => 0f;

        protected override Vector3 ResolveAxis(in GizmoContext context) => context.Frame.Axis(AxisIndex);

        protected override float ResolveRadius(in GizmoContext context) =>
            context.Frame.Size * context.Theme.RotationRadius;

        public override void Draw(IGizmoDrawer drawer, in GizmoContext context, GizmoHandleState state)
        {
            var theme = drawer.Theme;
            drawer.DrawCircle(
                context.Frame.Position,
                context.Frame.Axis(AxisIndex),
                ResolveRadius(context),
                theme.Resolve(AxisIndex, state),
                theme.LineThickness);
        }
    }

    /// <summary>Outer ring that turns about the view direction.</summary>
    public sealed class ScreenRotateHandle : RotateHandleBase
    {
        public ScreenRotateHandle()
            : base("rotate.screen", axisIndex: -1, priority: 1)
        {
        }

        protected override Vector3 ResolveAxis(in GizmoContext context) => -context.Camera.transform.forward;

        protected override float ResolveRadius(in GizmoContext context) =>
            context.Frame.Size * context.Theme.ScreenRotationRadius;

        public override void Draw(IGizmoDrawer drawer, in GizmoContext context, GizmoHandleState state)
        {
            var theme = drawer.Theme;
            var color = state == GizmoHandleState.Normal ? theme.ScreenAxis : theme.Resolve(-1, state);
            drawer.DrawCircle(
                context.Frame.Position,
                -context.Camera.transform.forward,
                ResolveRadius(context),
                color,
                theme.LineThickness);
        }
    }
}
