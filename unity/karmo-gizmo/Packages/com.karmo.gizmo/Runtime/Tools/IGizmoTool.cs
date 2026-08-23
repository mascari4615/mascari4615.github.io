using System.Collections.Generic;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// A named set of handles - move, rotate, scale, or anything a project invents.
    /// A tool owns layout and constraints; the handles own the maths.
    /// </summary>
    public interface IGizmoTool
    {
        /// <summary>Stable id used to select the tool and to persist the last used one.</summary>
        string Id { get; }

        /// <summary>Human-readable name for host-side UI.</summary>
        string DisplayName { get; }

        IReadOnlyList<IGizmoHandle> Handles { get; }

        /// <summary>
        /// Spaces this tool refuses. Scaling is only exactly representable in the
        /// target's own basis, so ScaleTool rejects everything except Local.
        /// </summary>
        bool SupportsSpace(TransformSpace space);

        /// <summary>Called when the tool becomes active, so it can reset any cached state.</summary>
        void OnActivated(IGizmoSelection selection);

        /// <summary>Called when another tool takes over.</summary>
        void OnDeactivated();
    }

    /// <summary>Shared list plumbing for tools built out of a fixed set of handles.</summary>
    public abstract class GizmoToolBase : IGizmoTool
    {
        private readonly List<IGizmoHandle> _handles = new List<IGizmoHandle>();

        protected GizmoToolBase(string id, string displayName)
        {
            Id = id;
            DisplayName = displayName;
        }

        public string Id { get; }
        public string DisplayName { get; }
        public IReadOnlyList<IGizmoHandle> Handles => _handles;

        protected void AddHandle(IGizmoHandle handle)
        {
            if (handle != null) _handles.Add(handle);
        }

        /// <summary>Adds a handle at runtime, so a host can extend a built-in tool in place.</summary>
        public void Extend(IGizmoHandle handle) => AddHandle(handle);

        public virtual bool SupportsSpace(TransformSpace space) => true;

        public virtual void OnActivated(IGizmoSelection selection)
        {
        }

        public virtual void OnDeactivated()
        {
        }
    }
}
