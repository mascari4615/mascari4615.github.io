using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>One frame of pointer state, however it was produced.</summary>
    public readonly struct GizmoPointerState
    {
        public readonly Vector2 Position;
        public readonly bool Pressed;
        public readonly bool Held;
        public readonly bool Released;
        public readonly GizmoModifiers Modifiers;

        /// <summary>The user asked to abort the drag in progress.</summary>
        public readonly bool Cancel;

        /// <summary>True when the pointer is over host UI and the gizmo should keep its hands off.</summary>
        public readonly bool Blocked;

        public GizmoPointerState(
            Vector2 position,
            bool pressed,
            bool held,
            bool released,
            GizmoModifiers modifiers,
            bool cancel = false,
            bool blocked = false)
        {
            Position = position;
            Pressed = pressed;
            Held = held;
            Released = released;
            Modifiers = modifiers;
            Cancel = cancel;
            Blocked = blocked;
        }
    }

    /// <summary>
    /// Where pointer state comes from. The gizmo never reads a device directly, so the
    /// same handles can be driven by a mouse, a touchscreen, a VR controller ray, a
    /// phone acting as a 6DoF camera, or a recorded script in a test.
    /// </summary>
    public interface IGizmoInput
    {
        GizmoPointerState Poll(Camera camera);

        /// <summary>Ray for a screen position, so exotic inputs can supply their own.</summary>
        Ray GetPointerRay(Camera camera, Vector2 screenPosition);

        /// <summary>Optional tool cycling request this frame. Null when nothing was pressed.</summary>
        string RequestedToolId { get; }

        /// <summary>Optional space toggle request this frame.</summary>
        bool RequestedSpaceToggle { get; }

        /// <summary>Undo / redo requests, which the controller forwards to <see cref="IGizmoUndo"/>.</summary>
        bool RequestedUndo { get; }

        bool RequestedRedo { get; }
    }
}
