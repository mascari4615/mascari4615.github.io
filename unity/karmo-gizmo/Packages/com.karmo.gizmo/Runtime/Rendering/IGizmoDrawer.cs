using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// The drawing surface handles paint onto. Deliberately primitive - lines, discs,
    /// cones, quads - so a replacement can render the same gizmo through a UI overlay,
    /// a custom SRP pass, a stylised shader, or a headless recorder for tests.
    /// </summary>
    public interface IGizmoDrawer
    {
        /// <summary>The theme in force, so handles do not each carry their own palette.</summary>
        GizmoTheme Theme { get; }

        /// <summary>Camera the current batch is being drawn for.</summary>
        Camera Camera { get; }

        void DrawLine(Vector3 from, Vector3 to, Color color, float thickness);

        /// <summary>Solid cone used for arrow heads. <paramref name="direction"/> points at the tip.</summary>
        void DrawCone(Vector3 baseCenter, Vector3 direction, float length, float radius, Color color);

        void DrawCube(Vector3 center, Quaternion rotation, float size, Color color);

        void DrawSphere(Vector3 center, float radius, Color color);

        /// <summary>Outline of a circle lying in the plane defined by the normal.</summary>
        void DrawCircle(Vector3 center, Vector3 normal, float radius, Color color, float thickness);

        /// <summary>
        /// Arc from <paramref name="from"/> swept by <paramref name="angleInDegrees"/>,
        /// used for the rotation read-out while dragging.
        /// </summary>
        void DrawArc(Vector3 center, Vector3 normal, Vector3 from, float angleInDegrees, float radius, Color color, bool filled);

        /// <summary>Filled quad spanned by two axes, used for plane-move handles.</summary>
        void DrawQuad(Vector3 center, Vector3 axisA, Vector3 axisB, float size, Color fill, Color outline);
    }
}
