using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// A whole drag expressed as one absolute change from the pose the targets had
    /// when the drag began. Handles never mutate targets incrementally - they report
    /// "this is the total change so far" and the controller replays it onto the
    /// <see cref="TargetSnapshot"/>s. That keeps snapping, undo and clamping exact
    /// instead of accumulating float drift over hundreds of frames.
    /// </summary>
    public readonly struct TransformDelta
    {
        /// <summary>World-space translation.</summary>
        public readonly Vector3 Translation;

        /// <summary>World-space rotation applied about <see cref="Pivot"/>.</summary>
        public readonly Quaternion Rotation;

        /// <summary>Per-axis multiplier in <see cref="Frame"/>'s basis.</summary>
        public readonly Vector3 Scale;

        /// <summary>World-space point that rotation and scale pivot around.</summary>
        public readonly Vector3 Pivot;

        /// <summary>Basis <see cref="Scale"/> is expressed in.</summary>
        public readonly Quaternion Frame;

        public static readonly TransformDelta Identity = new TransformDelta(
            Vector3.zero, Quaternion.identity, Vector3.one, Vector3.zero, Quaternion.identity);

        public TransformDelta(Vector3 translation, Quaternion rotation, Vector3 scale, Vector3 pivot, Quaternion frame)
        {
            Translation = translation;
            Rotation = rotation;
            Scale = scale;
            Pivot = pivot;
            Frame = frame;
        }

        public static TransformDelta Translate(Vector3 translation) => new TransformDelta(
            translation, Quaternion.identity, Vector3.one, Vector3.zero, Quaternion.identity);

        public static TransformDelta Rotate(Quaternion rotation, Vector3 pivot) => new TransformDelta(
            Vector3.zero, rotation, Vector3.one, pivot, Quaternion.identity);

        public static TransformDelta Resize(Vector3 scale, Vector3 pivot, Quaternion frame) => new TransformDelta(
            Vector3.zero, Quaternion.identity, scale, pivot, frame);

        public bool IsIdentity =>
            Translation == Vector3.zero && Scale == Vector3.one && Rotation == Quaternion.identity;

        /// <summary>Replays this delta onto a pose captured at drag start.</summary>
        public void ApplyTo(in TargetSnapshot snapshot)
        {
            var target = snapshot.Target;
            if (target == null || !target.IsValid) return;

            var inverseFrame = Quaternion.Inverse(Frame);
            var offset = inverseFrame * (snapshot.Position - Pivot);
            offset = Vector3.Scale(offset, Scale);

            target.Position = Pivot + Rotation * (Frame * offset) + Translation;
            target.Rotation = Rotation * snapshot.Rotation;

            if (Scale != Vector3.one)
            {
                // Non-uniform scale is only exactly representable when the frame lines up
                // with the target's own basis, so tools that scale pin themselves to
                // TransformSpace.Local. See ScaleTool.
                var axes = Quaternion.Inverse(snapshot.Rotation) * (Frame * Scale);
                target.LocalScale = new Vector3(
                    snapshot.LocalScale.x * Mathf.Abs(axes.x),
                    snapshot.LocalScale.y * Mathf.Abs(axes.y),
                    snapshot.LocalScale.z * Mathf.Abs(axes.z));
            }
        }
    }
}
