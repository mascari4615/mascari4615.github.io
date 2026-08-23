using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Anything the gizmo can move. The gizmo never touches <see cref="Transform"/>
    /// directly, so a target can just as well be a level-editor data record, an ECS
    /// entity, a networked proxy or an undo-journaled document node.
    /// </summary>
    public interface IGizmoTarget
    {
        /// <summary>Stable identity, used for selection sets and undo entries.</summary>
        object Id { get; }

        /// <summary>False once the underlying object is gone; the gizmo drops it silently.</summary>
        bool IsValid { get; }

        Vector3 Position { get; set; }
        Quaternion Rotation { get; set; }

        /// <summary>Scale in the target's own local basis.</summary>
        Vector3 LocalScale { get; set; }

        /// <summary>Basis the parent imposes, used by <see cref="TransformSpace.Parent"/>.</summary>
        Quaternion ParentRotation { get; }

        /// <summary>World-space bounds, used by bounds-centre pivot strategies. May be empty.</summary>
        Bounds WorldBounds { get; }
    }

    /// <summary>Immutable pose snapshot taken when a drag begins.</summary>
    public readonly struct TargetSnapshot
    {
        public readonly IGizmoTarget Target;
        public readonly Vector3 Position;
        public readonly Quaternion Rotation;
        public readonly Vector3 LocalScale;

        public TargetSnapshot(IGizmoTarget target)
        {
            Target = target;
            Position = target.Position;
            Rotation = target.Rotation;
            LocalScale = target.LocalScale;
        }

        public void Restore()
        {
            if (Target == null || !Target.IsValid) return;
            Target.Position = Position;
            Target.Rotation = Rotation;
            Target.LocalScale = LocalScale;
        }
    }
}
