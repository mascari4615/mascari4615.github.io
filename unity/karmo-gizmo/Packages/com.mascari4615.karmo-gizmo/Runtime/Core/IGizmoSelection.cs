using System;
using System.Collections.Generic;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// The set of things the gizmo currently acts on. Swap the implementation to bind
    /// the gizmo to a host application's own selection model instead of keeping a
    /// second copy of the truth.
    /// </summary>
    public interface IGizmoSelection
    {
        IReadOnlyList<IGizmoTarget> Targets { get; }

        /// <summary>The target that defines local/parent space. Usually the last added.</summary>
        IGizmoTarget Active { get; }

        int Count { get; }

        bool Contains(IGizmoTarget target);

        void Add(IGizmoTarget target);
        void Remove(IGizmoTarget target);
        void Set(IGizmoTarget target);
        void Clear();

        /// <summary>Raised after any change, so tools and drawers can rebuild.</summary>
        event Action Changed;
    }
}
