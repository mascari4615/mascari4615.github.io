using System;
using System.Collections.Generic;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>Default in-memory <see cref="IGizmoSelection"/>.</summary>
    public sealed class GizmoSelection : IGizmoSelection
    {
        private readonly List<IGizmoTarget> _targets = new List<IGizmoTarget>();

        public IReadOnlyList<IGizmoTarget> Targets => _targets;
        public IGizmoTarget Active => _targets.Count > 0 ? _targets[_targets.Count - 1] : null;
        public int Count => _targets.Count;

        public event Action Changed;

        public bool Contains(IGizmoTarget target) => target != null && _targets.Contains(target);

        public void Add(IGizmoTarget target)
        {
            if (target == null || _targets.Contains(target)) return;
            _targets.Add(target);
            Changed?.Invoke();
        }

        public void Remove(IGizmoTarget target)
        {
            if (target == null || !_targets.Remove(target)) return;
            Changed?.Invoke();
        }

        public void Set(IGizmoTarget target)
        {
            _targets.Clear();
            if (target != null) _targets.Add(target);
            Changed?.Invoke();
        }

        public void Clear()
        {
            if (_targets.Count == 0) return;
            _targets.Clear();
            Changed?.Invoke();
        }

        /// <summary>Toggles membership, the usual ctrl-click behaviour.</summary>
        public void Toggle(IGizmoTarget target)
        {
            if (target == null) return;
            if (Contains(target)) Remove(target);
            else Add(target);
        }

        /// <summary>Drops targets whose underlying object has been destroyed.</summary>
        public bool Prune()
        {
            var removed = _targets.RemoveAll(t => t == null || !t.IsValid);
            if (removed <= 0) return false;
            Changed?.Invoke();
            return true;
        }
    }
}
