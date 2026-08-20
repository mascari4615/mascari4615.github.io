using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>How a handle should be drawn right now.</summary>
    public enum GizmoHandleState
    {
        Normal,
        Hovered,
        Active,

        /// <summary>Present but unusable - typically an axis pointing at the camera.</summary>
        Disabled
    }

    /// <summary>A handle the pointer landed on, with enough information to rank it.</summary>
    public readonly struct HandleHit
    {
        public readonly IGizmoHandle Handle;

        /// <summary>Pixel distance from the pointer. Smaller wins.</summary>
        public readonly float ScreenDistance;

        /// <summary>Breaks ties so a plane quad can beat the axes crossing it.</summary>
        public readonly int Priority;

        public HandleHit(IGizmoHandle handle, float screenDistance, int priority)
        {
            Handle = handle;
            ScreenDistance = screenDistance;
            Priority = priority;
        }

        public bool IsBetterThan(in HandleHit other)
        {
            if (other.Handle == null) return true;
            if (Priority != other.Priority) return Priority > other.Priority;
            return ScreenDistance < other.ScreenDistance;
        }
    }

    /// <summary>
    /// One draggable part of a gizmo: an axis arrow, a plane quad, a rotation ring.
    /// Implement this to add manipulation the built-in tools do not cover - a length
    /// handle on a wall, a radius handle on a light, a waypoint tangent.
    ///
    /// Contract: a handle is stateless with respect to targets. It reports the total
    /// change since <see cref="BeginDrag"/>, and the controller replays that onto the
    /// snapshots it took. Handles never write to an <see cref="IGizmoTarget"/>.
    /// </summary>
    public interface IGizmoHandle
    {
        /// <summary>Stable identifier, handy for styling and for host-side analytics.</summary>
        string Id { get; }

        /// <summary>Ranking weight when several handles overlap under the pointer.</summary>
        int Priority { get; }

        /// <summary>Can this handle be grabbed in the current view?</summary>
        bool IsUsable(in GizmoContext context);

        /// <summary>Pixel-accurate hit test. Return false when the pointer is not on it.</summary>
        bool TryPick(in GizmoContext context, out HandleHit hit);

        /// <summary>Record whatever reference the drag is measured against.</summary>
        void BeginDrag(in GizmoContext context);

        /// <summary>Total change since <see cref="BeginDrag"/>. Called once per frame while held.</summary>
        TransformDelta UpdateDrag(in GizmoContext context);

        /// <summary>Drag finished. <paramref name="cancelled"/> means the change was rolled back.</summary>
        void EndDrag(in GizmoContext context, bool cancelled);

        void Draw(IGizmoDrawer drawer, in GizmoContext context, GizmoHandleState state);
    }

    /// <summary>
    /// Shared plumbing for handles: identity, the axis they act on, and the
    /// view-alignment guard that keeps degenerate axes from being grabbed.
    /// </summary>
    public abstract class GizmoHandleBase : IGizmoHandle
    {
        protected GizmoHandleBase(string id, int axisIndex, int priority)
        {
            Id = id;
            AxisIndex = axisIndex;
            Priority = priority;
        }

        public string Id { get; }
        public int Priority { get; }

        /// <summary>0 = X, 1 = Y, 2 = Z. -1 for handles with no single axis.</summary>
        public int AxisIndex { get; }

        /// <summary>Below this alignment the axis is too edge-on to drag meaningfully.</summary>
        protected virtual float MinimumViewAlignment => 0.06f;

        public virtual bool IsUsable(in GizmoContext context)
        {
            if (AxisIndex < 0) return true;
            var alignment = GizmoMath.AxisViewAlignment(
                context.Camera, context.Frame.Position, context.Frame.Axis(AxisIndex));
            return alignment > MinimumViewAlignment;
        }

        public abstract bool TryPick(in GizmoContext context, out HandleHit hit);
        public abstract void BeginDrag(in GizmoContext context);
        public abstract TransformDelta UpdateDrag(in GizmoContext context);

        public virtual void EndDrag(in GizmoContext context, bool cancelled)
        {
        }

        public abstract void Draw(IGizmoDrawer drawer, in GizmoContext context, GizmoHandleState state);

        /// <summary>World-space direction this handle acts along.</summary>
        protected Vector3 AxisDirection(in GizmoContext context) =>
            AxisIndex >= 0 ? context.Frame.Axis(AxisIndex) : context.Frame.Forward;

        /// <summary>Pick tolerance in pixels, honouring the settings asset.</summary>
        protected static float PickTolerance(in GizmoContext context) =>
            context.Settings != null ? context.Settings.PickToleranceInPixels : 12f;
    }
}
