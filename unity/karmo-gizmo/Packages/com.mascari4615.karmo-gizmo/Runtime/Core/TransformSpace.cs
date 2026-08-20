namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Orientation basis the gizmo handles are laid out in.
    /// Extend by using <see cref="Custom"/> and supplying an
    /// <see cref="IGizmoFrameProvider"/> to the controller.
    /// </summary>
    public enum TransformSpace
    {
        /// <summary>Axis-aligned with the world.</summary>
        World = 0,

        /// <summary>Aligned with the active target's own rotation.</summary>
        Local = 1,

        /// <summary>Aligned with the active target's parent.</summary>
        Parent = 2,

        /// <summary>Aligned with the camera (right / up / forward).</summary>
        Screen = 3,

        /// <summary>Supplied by an <see cref="IGizmoFrameProvider"/>.</summary>
        Custom = 4
    }
}
