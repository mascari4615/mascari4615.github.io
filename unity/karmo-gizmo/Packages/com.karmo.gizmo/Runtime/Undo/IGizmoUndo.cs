using System.Collections.Generic;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Where finished edits go. The default keeps its own stack, but a host with an
    /// existing undo system should implement this and forward, so gizmo edits
    /// interleave correctly with everything else the user does.
    /// </summary>
    public interface IGizmoUndo
    {
        /// <summary>Records one completed drag. <paramref name="before"/> is the pose at drag start.</summary>
        void Record(string label, IReadOnlyList<TargetSnapshot> before);

        bool CanUndo { get; }
        bool CanRedo { get; }

        void Undo();
        void Redo();
        void Clear();
    }

    /// <summary>Bounded in-memory undo stack, enough for a standalone editor mode.</summary>
    public sealed class GizmoUndoStack : IGizmoUndo
    {
        private readonly List<Entry> _undo = new List<Entry>();
        private readonly List<Entry> _redo = new List<Entry>();
        private readonly int _capacity;

        public GizmoUndoStack(int capacity = 128)
        {
            _capacity = UnityEngine.Mathf.Max(1, capacity);
        }

        public bool CanUndo => _undo.Count > 0;
        public bool CanRedo => _redo.Count > 0;

        public void Record(string label, IReadOnlyList<TargetSnapshot> before)
        {
            if (before == null || before.Count == 0) return;

            // The "after" side is captured now, while the drag result is still live,
            // so redo does not have to replay the drag maths.
            var entry = new Entry(label, before);
            _undo.Add(entry);
            _redo.Clear();

            if (_undo.Count > _capacity) _undo.RemoveAt(0);
        }

        public void Undo()
        {
            if (_undo.Count == 0) return;

            var entry = _undo[_undo.Count - 1];
            _undo.RemoveAt(_undo.Count - 1);
            entry.CaptureAfter();
            entry.RestoreBefore();
            _redo.Add(entry);
        }

        public void Redo()
        {
            if (_redo.Count == 0) return;

            var entry = _redo[_redo.Count - 1];
            _redo.RemoveAt(_redo.Count - 1);
            entry.RestoreAfter();
            _undo.Add(entry);
        }

        public void Clear()
        {
            _undo.Clear();
            _redo.Clear();
        }

        private sealed class Entry
        {
            private readonly TargetSnapshot[] _before;
            private TargetSnapshot[] _after;

            public Entry(string label, IReadOnlyList<TargetSnapshot> before)
            {
                Label = label;
                _before = new TargetSnapshot[before.Count];
                for (var i = 0; i < before.Count; i++) _before[i] = before[i];
            }

            public string Label { get; }

            public void CaptureAfter()
            {
                _after = new TargetSnapshot[_before.Length];
                for (var i = 0; i < _before.Length; i++)
                {
                    _after[i] = new TargetSnapshot(_before[i].Target);
                }
            }

            public void RestoreBefore()
            {
                for (var i = 0; i < _before.Length; i++) _before[i].Restore();
            }

            public void RestoreAfter()
            {
                if (_after == null) return;
                for (var i = 0; i < _after.Length; i++) _after[i].Restore();
            }
        }
    }
}
