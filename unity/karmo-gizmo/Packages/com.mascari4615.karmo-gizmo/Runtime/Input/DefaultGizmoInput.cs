using System;
using UnityEngine;
#if KARMO_GIZMO_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Mouse and keyboard, read through the Input System when it is present and
    /// through the legacy manager otherwise. Both paths produce the same
    /// <see cref="GizmoPointerState"/>, so nothing downstream knows the difference.
    /// </summary>
    public sealed class DefaultGizmoInput : IGizmoInput
    {
        private bool _wasHeld;

        /// <summary>
        /// Returns true while the pointer is over host UI and the gizmo should keep its
        /// hands off. Left open rather than hard-wired to uGUI's EventSystem, so the
        /// package pulls in no UI dependency and works the same for UI Toolkit, IMGUI
        /// or a bespoke overlay. Typical uGUI wiring:
        /// <code>
        /// input.PointerBlocked = () =>
        ///     EventSystem.current != null &amp;&amp; EventSystem.current.IsPointerOverGameObject();
        /// </code>
        /// </summary>
        public Func<bool> PointerBlocked { get; set; }

        public string RequestedToolId { get; private set; }
        public bool RequestedSpaceToggle { get; private set; }
        public bool RequestedUndo { get; private set; }
        public bool RequestedRedo { get; private set; }

        public GizmoPointerState Poll(Camera camera)
        {
            ReadShortcuts();

            var position = ReadPointerPosition();
            var held = ReadPrimaryHeld();
            var pressed = held && !_wasHeld;
            var released = !held && _wasHeld;
            _wasHeld = held;

            var modifiers = ReadModifiers();
            var cancel = ReadCancel();
            var blocked = PointerBlocked != null && PointerBlocked();

            return new GizmoPointerState(position, pressed, held, released, modifiers, cancel, blocked);
        }

        public Ray GetPointerRay(Camera camera, Vector2 screenPosition) =>
            camera != null ? camera.ScreenPointToRay(screenPosition) : new Ray(Vector3.zero, Vector3.forward);

        private void ReadShortcuts()
        {
            RequestedToolId = null;
            RequestedSpaceToggle = false;
            RequestedUndo = false;
            RequestedRedo = false;

#if KARMO_GIZMO_INPUT_SYSTEM
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            if (keyboard.wKey.wasPressedThisFrame) RequestedToolId = GizmoToolIds.Move;
            else if (keyboard.eKey.wasPressedThisFrame) RequestedToolId = GizmoToolIds.Rotate;
            else if (keyboard.rKey.wasPressedThisFrame) RequestedToolId = GizmoToolIds.Scale;
            else if (keyboard.tKey.wasPressedThisFrame) RequestedToolId = GizmoToolIds.Universal;

            if (keyboard.xKey.wasPressedThisFrame) RequestedSpaceToggle = true;

            var control = keyboard.leftCtrlKey.isPressed || keyboard.rightCtrlKey.isPressed;
            var shift = keyboard.leftShiftKey.isPressed || keyboard.rightShiftKey.isPressed;
            if (control && keyboard.zKey.wasPressedThisFrame)
            {
                if (shift) RequestedRedo = true;
                else RequestedUndo = true;
            }
            else if (control && keyboard.yKey.wasPressedThisFrame)
            {
                RequestedRedo = true;
            }
#elif ENABLE_LEGACY_INPUT_MANAGER
            if (UnityEngine.Input.GetKeyDown(KeyCode.W)) RequestedToolId = GizmoToolIds.Move;
            else if (UnityEngine.Input.GetKeyDown(KeyCode.E)) RequestedToolId = GizmoToolIds.Rotate;
            else if (UnityEngine.Input.GetKeyDown(KeyCode.R)) RequestedToolId = GizmoToolIds.Scale;
            else if (UnityEngine.Input.GetKeyDown(KeyCode.T)) RequestedToolId = GizmoToolIds.Universal;

            if (UnityEngine.Input.GetKeyDown(KeyCode.X)) RequestedSpaceToggle = true;

            var control = UnityEngine.Input.GetKey(KeyCode.LeftControl) || UnityEngine.Input.GetKey(KeyCode.RightControl);
            var shift = UnityEngine.Input.GetKey(KeyCode.LeftShift) || UnityEngine.Input.GetKey(KeyCode.RightShift);
            if (control && UnityEngine.Input.GetKeyDown(KeyCode.Z))
            {
                if (shift) RequestedRedo = true;
                else RequestedUndo = true;
            }
            else if (control && UnityEngine.Input.GetKeyDown(KeyCode.Y))
            {
                RequestedRedo = true;
            }
#endif
        }

        private static Vector2 ReadPointerPosition()
        {
#if KARMO_GIZMO_INPUT_SYSTEM
            var pointer = Pointer.current;
            if (pointer != null) return pointer.position.ReadValue();
#endif
#if ENABLE_LEGACY_INPUT_MANAGER
            return UnityEngine.Input.mousePosition;
#else
            return Vector2.zero;
#endif
        }

        private static bool ReadPrimaryHeld()
        {
#if KARMO_GIZMO_INPUT_SYSTEM
            var mouse = Mouse.current;
            if (mouse != null) return mouse.leftButton.isPressed;

            var touch = Touchscreen.current;
            if (touch != null) return touch.primaryTouch.press.isPressed;
#endif
#if ENABLE_LEGACY_INPUT_MANAGER
            return UnityEngine.Input.GetMouseButton(0);
#else
            return false;
#endif
        }

        private static GizmoModifiers ReadModifiers()
        {
            var modifiers = GizmoModifiers.None;

#if KARMO_GIZMO_INPUT_SYSTEM
            var keyboard = Keyboard.current;
            if (keyboard != null)
            {
                if (keyboard.leftCtrlKey.isPressed || keyboard.rightCtrlKey.isPressed) modifiers |= GizmoModifiers.Snap;
                if (keyboard.leftShiftKey.isPressed || keyboard.rightShiftKey.isPressed) modifiers |= GizmoModifiers.Uniform;
                if (keyboard.leftAltKey.isPressed || keyboard.rightAltKey.isPressed) modifiers |= GizmoModifiers.Precise;
                if (keyboard.leftShiftKey.isPressed) modifiers |= GizmoModifiers.Additive;
            }
#elif ENABLE_LEGACY_INPUT_MANAGER
            if (UnityEngine.Input.GetKey(KeyCode.LeftControl) || UnityEngine.Input.GetKey(KeyCode.RightControl))
                modifiers |= GizmoModifiers.Snap;
            if (UnityEngine.Input.GetKey(KeyCode.LeftShift) || UnityEngine.Input.GetKey(KeyCode.RightShift))
                modifiers |= GizmoModifiers.Uniform | GizmoModifiers.Additive;
            if (UnityEngine.Input.GetKey(KeyCode.LeftAlt) || UnityEngine.Input.GetKey(KeyCode.RightAlt))
                modifiers |= GizmoModifiers.Precise;
#endif

            return modifiers;
        }

        private static bool ReadCancel()
        {
#if KARMO_GIZMO_INPUT_SYSTEM
            var keyboard = Keyboard.current;
            if (keyboard != null) return keyboard.escapeKey.wasPressedThisFrame;
#endif
#if ENABLE_LEGACY_INPUT_MANAGER
            return UnityEngine.Input.GetKeyDown(KeyCode.Escape);
#else
            return false;
#endif
        }
    }
}
