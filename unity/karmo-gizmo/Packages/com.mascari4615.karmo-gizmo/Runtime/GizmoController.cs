using System;
using System.Collections.Generic;
using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Wires the pieces together and owns the drag state machine. Every collaborator
    /// is a property, so a host can replace any one of them at runtime without
    /// subclassing anything: input, picking, snapping, undo, pivot, frame, drawing,
    /// selection and the tool set.
    /// </summary>
    [AddComponentMenu("Karmo Gizmo/Gizmo Controller")]
    [DisallowMultipleComponent]
    public sealed class GizmoController : MonoBehaviour
    {
        [Header("Wiring")]
        [Tooltip("Camera the gizmo is drawn for and picked against. Defaults to Camera.main.")]
        [SerializeField] private Camera _camera;

        [SerializeField] private GizmoSettings _settings;
        [SerializeField] private GizmoTheme _theme;

        [Header("Selection")]
        [Tooltip("Layers a click can select from.")]
        [SerializeField] private LayerMask _selectableLayers = ~0;

        [Tooltip("Select the outermost parent rather than the collider that was hit.")]
        [SerializeField] private bool _selectRoot = true;

        [Tooltip("Clicking empty space clears the selection.")]
        [SerializeField] private bool _clearSelectionOnMiss = true;

        [Header("Defaults")]
        [SerializeField] private string _startingToolId = GizmoToolIds.Move;
        [SerializeField] private TransformSpace _space = TransformSpace.Local;

        private readonly List<TargetSnapshot> _snapshots = new List<TargetSnapshot>();

        private IGizmoHandle _hoveredHandle;
        private IGizmoHandle _activeHandle;
        private GizmoFrame _dragFrame;
        private bool _isDragging;

        /// <summary>Raised when a drag starts, with the handle that was grabbed.</summary>
        public event Action<IGizmoHandle> DragBegan;

        /// <summary>Raised when a drag ends. The flag is true when the drag was cancelled.</summary>
        public event Action<IGizmoHandle, bool> DragEnded;

        /// <summary>Raised every frame a drag changes the targets.</summary>
        public event Action<TransformDelta> Dragging;

        public event Action<IGizmoTool> ToolChanged;

        public Camera Camera
        {
            get => _camera != null ? _camera : _camera = Camera.main;
            set => _camera = value;
        }

        public GizmoSettings Settings
        {
            get => _settings != null ? _settings : _settings = GizmoSettings.CreateDefault();
            set => _settings = value;
        }

        public GizmoTheme Theme
        {
            get => _theme != null ? _theme : _theme = GizmoTheme.CreateDefault();
            set
            {
                _theme = value;
                if (Drawer is ImmediateGizmoDrawer immediate) immediate.Theme = value;
            }
        }

        public IGizmoSelection Selection { get; set; }
        public GizmoToolRegistry Tools { get; set; }
        public IGizmoInput Input { get; set; }
        public IGizmoPicker Picker { get; set; }
        public ISnapProvider Snap { get; set; }
        public IGizmoUndo Undo { get; set; }
        public IPivotStrategy PivotStrategy { get; set; }
        public IGizmoDrawer Drawer { get; set; }

        /// <summary>Supplies the frame while <see cref="Space"/> is Custom.</summary>
        public IGizmoFrameProvider FrameProvider { get; set; }

        public IGizmoTool ActiveTool { get; private set; }
        public bool IsDragging => _isDragging;

        /// <summary>Handle under the pointer, or null. Useful for host-side cursors.</summary>
        public IGizmoHandle HoveredHandle => _hoveredHandle;

        public TransformSpace Space
        {
            get => _space;
            set
            {
                if (ActiveTool != null && !ActiveTool.SupportsSpace(value)) return;
                _space = value;
            }
        }

        private void Awake()
        {
            Selection ??= new GizmoSelection();
            Tools ??= GizmoToolRegistry.CreateDefault();
            Input ??= new DefaultGizmoInput();
            Snap ??= new StepSnapProvider();
            Undo ??= new GizmoUndoStack();
            PivotStrategy ??= new ActivePivotStrategy();
            Drawer ??= new ImmediateGizmoDrawer(Theme);
            Picker ??= new PhysicsGizmoPicker(_selectableLayers) { SelectRoot = _selectRoot };

            SetTool(_startingToolId);
        }

        private void OnDestroy()
        {
            (Drawer as ImmediateGizmoDrawer)?.Dispose();
        }

        /// <summary>Switches tools by id. Falls back to the first registered tool.</summary>
        public bool SetTool(string toolId)
        {
            var tool = Tools.Find(toolId) ?? (Tools.Tools.Count > 0 ? Tools.Tools[0] : null);
            if (tool == null || tool == ActiveTool) return false;

            CancelDrag();
            ActiveTool?.OnDeactivated();
            ActiveTool = tool;
            ActiveTool.OnActivated(Selection);

            if (!ActiveTool.SupportsSpace(_space)) _space = TransformSpace.Local;

            ToolChanged?.Invoke(ActiveTool);
            return true;
        }

        /// <summary>Aborts the drag in progress and puts every target back where it started.</summary>
        public void CancelDrag()
        {
            if (!_isDragging) return;

            for (var i = 0; i < _snapshots.Count; i++) _snapshots[i].Restore();

            var handle = _activeHandle;
            EndDragState();
            DragEnded?.Invoke(handle, true);
        }

        private void Update()
        {
            var camera = Camera;
            if (camera == null || ActiveTool == null) return;

            (Selection as GizmoSelection)?.Prune();

            var pointer = Input.Poll(camera);
            HandleShortcuts();

            var context = BuildContext(camera, pointer);

            if (_isDragging) UpdateDrag(context, pointer);
            else UpdateIdle(context, pointer);

            Draw(context);
        }

        private void HandleShortcuts()
        {
            if (Input.RequestedToolId != null) SetTool(Input.RequestedToolId);

            if (Input.RequestedSpaceToggle)
            {
                Space = _space == TransformSpace.Local ? TransformSpace.World : TransformSpace.Local;
            }

            if (!_isDragging)
            {
                if (Input.RequestedUndo) Undo.Undo();
                else if (Input.RequestedRedo) Undo.Redo();
            }
        }

        private GizmoContext BuildContext(Camera camera, in GizmoPointerState pointer)
        {
            // While dragging, the frame is frozen at the pose it had when the drag
            // began. Letting it follow the object would feed the rotation back into
            // its own input and make the handle chase the pointer.
            var frame = _isDragging && !Settings.FollowRotationDuringDrag ? _dragFrame : BuildFrame(camera);

            return new GizmoContext(
                camera,
                pointer.Position,
                Input.GetPointerRay(camera, pointer.Position),
                frame,
                pointer.Modifiers,
                Snap,
                Settings,
                Theme);
        }

        private GizmoFrame BuildFrame(Camera camera)
        {
            if (_space == TransformSpace.Custom
                && FrameProvider != null
                && FrameProvider.TryGetFrame(Selection, camera, out var custom))
            {
                return custom;
            }

            var position = PivotStrategy.GetPivot(Selection);
            var size = GizmoMath.ConstantScreenSize(camera, position, Settings.ScreenSizeInPixels);
            return new GizmoFrame(position, ResolveRotation(camera), size);
        }

        private Quaternion ResolveRotation(Camera camera)
        {
            var active = Selection.Active;
            switch (_space)
            {
                case TransformSpace.Local:
                    return active != null ? active.Rotation : Quaternion.identity;
                case TransformSpace.Parent:
                    return active != null ? active.ParentRotation : Quaternion.identity;
                case TransformSpace.Screen:
                    return camera != null ? camera.transform.rotation : Quaternion.identity;
                default:
                    return Quaternion.identity;
            }
        }

        private void UpdateIdle(in GizmoContext context, in GizmoPointerState pointer)
        {
            _hoveredHandle = null;
            if (pointer.Blocked) return;

            var hit = default(HandleHit);
            if (Selection.Count > 0)
            {
                var handles = ActiveTool.Handles;
                for (var i = 0; i < handles.Count; i++)
                {
                    if (!handles[i].TryPick(context, out var candidate)) continue;
                    if (candidate.IsBetterThan(hit)) hit = candidate;
                }
            }

            _hoveredHandle = hit.Handle;

            if (!pointer.Pressed) return;

            if (hit.Handle != null) BeginDrag(hit.Handle, context);
            else SelectUnderPointer(context, pointer);
        }

        private void SelectUnderPointer(in GizmoContext context, in GizmoPointerState pointer)
        {
            if (Picker != null && Picker.TryPick(context.PointerRay, context.Camera, out var target))
            {
                if ((pointer.Modifiers & GizmoModifiers.Additive) != 0)
                {
                    if (Selection is GizmoSelection concrete) concrete.Toggle(target);
                    else Selection.Add(target);
                }
                else
                {
                    Selection.Set(target);
                }

                return;
            }

            if (_clearSelectionOnMiss && (pointer.Modifiers & GizmoModifiers.Additive) == 0)
            {
                Selection.Clear();
            }
        }

        private void BeginDrag(IGizmoHandle handle, in GizmoContext context)
        {
            _snapshots.Clear();
            var targets = Selection.Targets;
            for (var i = 0; i < targets.Count; i++)
            {
                if (targets[i] != null && targets[i].IsValid) _snapshots.Add(new TargetSnapshot(targets[i]));
            }

            if (_snapshots.Count == 0) return;

            _activeHandle = handle;
            _dragFrame = context.Frame;
            _isDragging = true;

            handle.BeginDrag(context);
            DragBegan?.Invoke(handle);
        }

        private void UpdateDrag(in GizmoContext context, in GizmoPointerState pointer)
        {
            if (pointer.Cancel)
            {
                CancelDrag();
                return;
            }

            var delta = _activeHandle.UpdateDrag(context);
            for (var i = 0; i < _snapshots.Count; i++) delta.ApplyTo(_snapshots[i]);
            Dragging?.Invoke(delta);

            if (pointer.Held && !pointer.Released) return;

            _activeHandle.EndDrag(context, false);

            if (!delta.IsIdentity) Undo.Record(ActiveTool.DisplayName, _snapshots);

            var handle = _activeHandle;
            EndDragState();
            DragEnded?.Invoke(handle, false);
        }

        private void EndDragState()
        {
            _isDragging = false;
            _activeHandle = null;
            _snapshots.Clear();
        }

        private void Draw(in GizmoContext context)
        {
            if (Selection.Count == 0) return;

            var immediate = Drawer as ImmediateGizmoDrawer;
            immediate?.Begin(context.Camera);

            var handles = ActiveTool.Handles;
            for (var i = 0; i < handles.Count; i++)
            {
                var handle = handles[i];
                var state = ResolveState(handle, context);
                handle.Draw(Drawer, context, state);
            }

            immediate?.End();
        }

        private GizmoHandleState ResolveState(IGizmoHandle handle, in GizmoContext context)
        {
            if (_isDragging) return handle == _activeHandle ? GizmoHandleState.Active : GizmoHandleState.Disabled;
            if (!handle.IsUsable(context)) return GizmoHandleState.Disabled;
            return handle == _hoveredHandle ? GizmoHandleState.Hovered : GizmoHandleState.Normal;
        }
    }
}
