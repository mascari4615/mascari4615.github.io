using System;
using System.Collections.Generic;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Ordered set of the tools a controller can switch between. A host registers its
    /// own tools here at startup and they behave exactly like the built-ins - same
    /// hotkey cycling, same UI listing, same space rules.
    /// </summary>
    public sealed class GizmoToolRegistry
    {
        private readonly List<IGizmoTool> _tools = new List<IGizmoTool>();

        public IReadOnlyList<IGizmoTool> Tools => _tools;

        public event Action Changed;

        /// <summary>Registry preloaded with Move, Rotate, Scale and Universal.</summary>
        public static GizmoToolRegistry CreateDefault()
        {
            var registry = new GizmoToolRegistry();
            registry.Register(new MoveTool());
            registry.Register(new RotateTool());
            registry.Register(new ScaleTool());
            registry.Register(new UniversalTool());
            return registry;
        }

        /// <summary>Adds a tool, replacing any existing one with the same id.</summary>
        public void Register(IGizmoTool tool)
        {
            if (tool == null) throw new ArgumentNullException(nameof(tool));

            var existing = IndexOf(tool.Id);
            if (existing >= 0) _tools[existing] = tool;
            else _tools.Add(tool);

            Changed?.Invoke();
        }

        public bool Unregister(string id)
        {
            var index = IndexOf(id);
            if (index < 0) return false;

            _tools.RemoveAt(index);
            Changed?.Invoke();
            return true;
        }

        public IGizmoTool Find(string id)
        {
            var index = IndexOf(id);
            return index >= 0 ? _tools[index] : null;
        }

        /// <summary>Next tool in registration order, wrapping around.</summary>
        public IGizmoTool Next(IGizmoTool current)
        {
            if (_tools.Count == 0) return null;
            if (current == null) return _tools[0];

            var index = _tools.IndexOf(current);
            return _tools[(index + 1 + _tools.Count) % _tools.Count];
        }

        private int IndexOf(string id)
        {
            for (var i = 0; i < _tools.Count; i++)
            {
                if (string.Equals(_tools[i].Id, id, StringComparison.Ordinal)) return i;
            }

            return -1;
        }
    }
}
