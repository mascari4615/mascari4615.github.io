using System;
using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>Chorded state that changes how a drag behaves while it is running.</summary>
    [Flags]
    public enum GizmoModifiers
    {
        None = 0,

        /// <summary>Force snapping on (or off, when snapping is the default).</summary>
        Snap = 1 << 0,

        /// <summary>Fine-grained movement for precise placement.</summary>
        Precise = 1 << 1,

        /// <summary>Constrain a scale drag to stay uniform.</summary>
        Uniform = 1 << 2,

        /// <summary>Add to the selection instead of replacing it.</summary>
        Additive = 1 << 3,

        /// <summary>Reserved for host apps that duplicate on drag.</summary>
        Duplicate = 1 << 4
    }

    /// <summary>
    /// Everything a handle needs to know about this frame, passed by reference so no
    /// handle has to reach out to globals. Nothing here is Unity-singleton bound,
    /// which is what makes handles testable and multi-camera safe.
    /// </summary>
    public readonly struct GizmoContext
    {
        public readonly Camera Camera;
        public readonly Vector2 ScreenPoint;
        public readonly Ray PointerRay;
        public readonly GizmoFrame Frame;
        public readonly GizmoModifiers Modifiers;
        public readonly ISnapProvider Snap;
        public readonly GizmoSettings Settings;

        /// <summary>
        /// Layout proportions live on the theme, and picking has to agree with drawing
        /// exactly, so the theme travels with the context rather than staying inside
        /// the drawer.
        /// </summary>
        public readonly GizmoTheme Theme;

        public GizmoContext(
            Camera camera,
            Vector2 screenPoint,
            Ray pointerRay,
            GizmoFrame frame,
            GizmoModifiers modifiers,
            ISnapProvider snap,
            GizmoSettings settings,
            GizmoTheme theme)
        {
            Camera = camera;
            ScreenPoint = screenPoint;
            PointerRay = pointerRay;
            Frame = frame;
            Modifiers = modifiers;
            Snap = snap;
            Settings = settings;
            Theme = theme;
        }

        public bool Has(GizmoModifiers modifier) => (Modifiers & modifier) != 0;

        /// <summary>Snapping is on when the setting says so, XOR the modifier key.</summary>
        public bool SnapActive
        {
            get
            {
                var wanted = Settings != null && Settings.SnapByDefault;
                return Has(GizmoModifiers.Snap) ? !wanted : wanted;
            }
        }

        /// <summary>Same context with a different frame, used when a tool re-anchors mid-drag.</summary>
        public GizmoContext WithFrame(GizmoFrame frame) =>
            new GizmoContext(Camera, ScreenPoint, PointerRay, frame, Modifiers, Snap, Settings, Theme);
    }
}
