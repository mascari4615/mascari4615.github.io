using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Decides where the gizmo sits for a given selection. Implement this for
    /// domain-specific anchors: grid-snapped pivots, a building's footprint corner,
    /// a rig joint.
    /// </summary>
    public interface IPivotStrategy
    {
        Vector3 GetPivot(IGizmoSelection selection);
    }

    /// <summary>Uses the active target's own origin. Matches the editor's Pivot mode.</summary>
    public sealed class ActivePivotStrategy : IPivotStrategy
    {
        public Vector3 GetPivot(IGizmoSelection selection) =>
            selection.Active != null ? selection.Active.Position : Vector3.zero;
    }

    /// <summary>Averages every selected target's origin.</summary>
    public sealed class AveragePivotStrategy : IPivotStrategy
    {
        public Vector3 GetPivot(IGizmoSelection selection)
        {
            var targets = selection.Targets;
            if (targets.Count == 0) return Vector3.zero;

            var sum = Vector3.zero;
            for (var i = 0; i < targets.Count; i++) sum += targets[i].Position;
            return sum / targets.Count;
        }
    }

    /// <summary>Centre of the combined renderer bounds. Matches the editor's Center mode.</summary>
    public sealed class BoundsCenterPivotStrategy : IPivotStrategy
    {
        public Vector3 GetPivot(IGizmoSelection selection)
        {
            var targets = selection.Targets;
            if (targets.Count == 0) return Vector3.zero;

            var bounds = targets[0].WorldBounds;
            for (var i = 1; i < targets.Count; i++) bounds.Encapsulate(targets[i].WorldBounds);
            return bounds.center;
        }
    }
}
