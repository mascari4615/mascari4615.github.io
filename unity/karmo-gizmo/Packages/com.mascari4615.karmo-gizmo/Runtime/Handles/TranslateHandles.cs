using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>Drags along a single axis of the gizmo frame.</summary>
    public sealed class AxisTranslateHandle : GizmoHandleBase
    {
        private float _startDistance;
        private float _lastDistance;
        private Vector3 _axis;

        public AxisTranslateHandle(int axisIndex)
            : base("translate.axis." + axisIndex, axisIndex, priority: 0)
        {
        }

        public override bool TryPick(in GizmoContext context, out HandleHit hit)
        {
            hit = default;
            if (!IsUsable(context)) return false;

            var origin = context.Frame.Position;
            var tip = origin + context.Frame.Axis(AxisIndex) * (context.Frame.Size * context.Theme.AxisLength);
            var distance = GizmoMath.ScreenDistanceToSegment(context.Camera, origin, tip, context.ScreenPoint);
            if (distance > PickTolerance(context)) return false;

            hit = new HandleHit(this, distance, Priority);
            return true;
        }

        public override void BeginDrag(in GizmoContext context)
        {
            _axis = context.Frame.Axis(AxisIndex);
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

            var translation = _axis * travelled;
            if (context.SnapActive && context.Snap != null)
            {
                translation = context.Snap.SnapTranslation(translation, context.Frame.Rotation, context);
            }

            return TransformDelta.Translate(translation);
        }

        public override void Draw(IGizmoDrawer drawer, in GizmoContext context, GizmoHandleState state)
        {
            var theme = drawer.Theme;
            var color = theme.Resolve(AxisIndex, state);
            var origin = context.Frame.Position;
            var axis = context.Frame.Axis(AxisIndex);
            var length = context.Frame.Size * theme.AxisLength;
            var headLength = context.Frame.Size * theme.ArrowHeadLength;

            var shaftEnd = origin + axis * (length - headLength);
            drawer.DrawLine(origin, shaftEnd, color, theme.LineThickness);
            drawer.DrawCone(shaftEnd, axis, headLength, context.Frame.Size * theme.ArrowHeadRadius, color);
        }
    }

    /// <summary>Drags freely within the plane spanned by two axes.</summary>
    public sealed class PlaneTranslateHandle : GizmoHandleBase
    {
        private readonly int _axisA;
        private readonly int _axisB;

        private Vector3 _normal;
        private Vector3 _startPoint;
        private Vector3 _lastPoint;
        private bool _hasStart;

        public PlaneTranslateHandle(int axisA, int axisB)
            : base($"translate.plane.{axisA}{axisB}", axisIndex: -1, priority: 1)
        {
            _axisA = axisA;
            _axisB = axisB;
        }

        /// <summary>The axis normal to this plane, which is also how the quad is coloured.</summary>
        public int NormalAxisIndex => 3 - _axisA - _axisB;

        private Vector3 Center(in GizmoContext context)
        {
            var offset = context.Frame.Size * context.Theme.PlaneOffset;
            return context.Frame.Position
                   + context.Frame.Axis(_axisA) * offset
                   + context.Frame.Axis(_axisB) * offset;
        }

        public override bool IsUsable(in GizmoContext context)
        {
            // A plane is unusable when seen edge-on, which is exactly when its normal
            // is perpendicular to the view - the opposite test from an axis handle.
            var alignment = GizmoMath.AxisViewAlignment(
                context.Camera, context.Frame.Position, context.Frame.Axis(NormalAxisIndex));
            return alignment < 0.94f;
        }

        public override bool TryPick(in GizmoContext context, out HandleHit hit)
        {
            hit = default;
            if (!IsUsable(context)) return false;

            var axisA = context.Frame.Axis(_axisA);
            var axisB = context.Frame.Axis(_axisB);
            var center = Center(context);
            var normal = Vector3.Cross(axisA, axisB).normalized;

            if (!GizmoMath.RayPlaneIntersection(context.PointerRay, center, normal, out var point)) return false;

            var half = context.Frame.Size * context.Theme.PlaneSize * 0.5f;
            var local = point - center;
            var a = Vector3.Dot(local, axisA);
            var b = Vector3.Dot(local, axisB);
            if (Mathf.Abs(a) > half || Mathf.Abs(b) > half) return false;

            var screenDistance = Vector2.Distance(
                context.ScreenPoint, context.Camera.WorldToScreenPoint(center));
            hit = new HandleHit(this, screenDistance, Priority);
            return true;
        }

        public override void BeginDrag(in GizmoContext context)
        {
            var axisA = context.Frame.Axis(_axisA);
            var axisB = context.Frame.Axis(_axisB);
            _normal = Vector3.Cross(axisA, axisB).normalized;
            _hasStart = GizmoMath.RayPlaneIntersection(
                context.PointerRay, context.Frame.Position, _normal, out _startPoint);
            _lastPoint = _startPoint;
        }

        public override TransformDelta UpdateDrag(in GizmoContext context)
        {
            if (!_hasStart) return TransformDelta.Identity;

            if (GizmoMath.RayPlaneIntersection(context.PointerRay, context.Frame.Position, _normal, out var point))
            {
                _lastPoint = point;
            }

            var translation = _lastPoint - _startPoint;
            if (context.Has(GizmoModifiers.Precise) && context.Settings != null)
            {
                translation *= context.Settings.PrecisionFactor;
            }

            if (context.SnapActive && context.Snap != null)
            {
                translation = context.Snap.SnapTranslation(translation, context.Frame.Rotation, context);
            }

            return TransformDelta.Translate(translation);
        }

        public override void Draw(IGizmoDrawer drawer, in GizmoContext context, GizmoHandleState state)
        {
            var theme = drawer.Theme;
            var color = theme.Resolve(NormalAxisIndex, state);
            var fill = color;
            fill.a *= theme.PlaneFillAlpha;

            drawer.DrawQuad(
                Center(context),
                context.Frame.Axis(_axisA),
                context.Frame.Axis(_axisB),
                context.Frame.Size * theme.PlaneSize,
                fill,
                color);
        }
    }

    /// <summary>Drags in the camera plane, the grab-anywhere centre handle.</summary>
    public sealed class ScreenTranslateHandle : GizmoHandleBase
    {
        private Vector3 _normal;
        private Vector3 _startPoint;
        private Vector3 _lastPoint;
        private bool _hasStart;

        public ScreenTranslateHandle()
            : base("translate.screen", axisIndex: -1, priority: 2)
        {
        }

        public override bool TryPick(in GizmoContext context, out HandleHit hit)
        {
            hit = default;

            var center = context.Camera.WorldToScreenPoint(context.Frame.Position);
            if (center.z < 0f) return false;

            var distance = Vector2.Distance(context.ScreenPoint, new Vector2(center.x, center.y));
            var radiusInPixels = context.Settings.ScreenSizeInPixels * context.Theme.CenterRadius;
            if (distance > radiusInPixels) return false;

            hit = new HandleHit(this, distance, Priority);
            return true;
        }

        public override void BeginDrag(in GizmoContext context)
        {
            _normal = -context.Camera.transform.forward;
            _hasStart = GizmoMath.RayPlaneIntersection(
                context.PointerRay, context.Frame.Position, _normal, out _startPoint);
            _lastPoint = _startPoint;
        }

        public override TransformDelta UpdateDrag(in GizmoContext context)
        {
            if (!_hasStart) return TransformDelta.Identity;

            if (GizmoMath.RayPlaneIntersection(context.PointerRay, context.Frame.Position, _normal, out var point))
            {
                _lastPoint = point;
            }

            var translation = _lastPoint - _startPoint;
            if (context.Has(GizmoModifiers.Precise) && context.Settings != null)
            {
                translation *= context.Settings.PrecisionFactor;
            }

            if (context.SnapActive && context.Snap != null)
            {
                translation = context.Snap.SnapTranslation(translation, context.Frame.Rotation, context);
            }

            return TransformDelta.Translate(translation);
        }

        public override void Draw(IGizmoDrawer drawer, in GizmoContext context, GizmoHandleState state)
        {
            var theme = drawer.Theme;
            var color = state == GizmoHandleState.Normal ? theme.ScreenAxis : theme.Resolve(-1, state);
            drawer.DrawSphere(context.Frame.Position, context.Frame.Size * theme.CenterRadius, color);
        }
    }
}
