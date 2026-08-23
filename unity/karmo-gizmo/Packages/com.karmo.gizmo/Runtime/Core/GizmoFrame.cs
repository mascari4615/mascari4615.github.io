using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Where the gizmo sits and how it is oriented this frame. Handles are laid out
    /// in this basis, and every <see cref="TransformDelta"/> is expressed relative to it.
    /// </summary>
    public readonly struct GizmoFrame
    {
        public readonly Vector3 Position;
        public readonly Quaternion Rotation;

        /// <summary>World-space size of one handle unit, kept constant on screen.</summary>
        public readonly float Size;

        public GizmoFrame(Vector3 position, Quaternion rotation, float size)
        {
            Position = position;
            Rotation = rotation;
            Size = size;
        }

        public Vector3 Right => Rotation * Vector3.right;
        public Vector3 Up => Rotation * Vector3.up;
        public Vector3 Forward => Rotation * Vector3.forward;

        /// <summary>World-space direction of axis <paramref name="index"/> (0 = X, 1 = Y, 2 = Z).</summary>
        public Vector3 Axis(int index)
        {
            switch (index)
            {
                case 0: return Right;
                case 1: return Up;
                default: return Forward;
            }
        }

        public Vector3 TransformPoint(Vector3 local) => Position + Rotation * (local * Size);
        public Vector3 TransformDirection(Vector3 local) => Rotation * local;
    }

    /// <summary>
    /// Supplies the frame for <see cref="TransformSpace.Custom"/>. Implement this to
    /// drive the gizmo from anything at all: a grid, a surface normal, a rig bone,
    /// a network-authoritative pose.
    /// </summary>
    public interface IGizmoFrameProvider
    {
        bool TryGetFrame(IGizmoSelection selection, Camera camera, out GizmoFrame frame);
    }
}
