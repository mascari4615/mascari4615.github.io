using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Turns a pointer ray into something selectable. Replace it when "what did I
    /// click" is not a physics question: a tile index, a spline knot, a sprite atlas
    /// entry, a server-authoritative id.
    /// </summary>
    public interface IGizmoPicker
    {
        bool TryPick(Ray ray, Camera camera, out IGizmoTarget target);
    }

    /// <summary>Physics raycast against colliders, filtered by layer.</summary>
    public sealed class PhysicsGizmoPicker : IGizmoPicker
    {
        private readonly RaycastHit[] _hits = new RaycastHit[16];

        public PhysicsGizmoPicker(LayerMask layerMask, float maxDistance = Mathf.Infinity)
        {
            LayerMask = layerMask;
            MaxDistance = maxDistance;
        }

        public LayerMask LayerMask { get; set; }
        public float MaxDistance { get; set; }

        /// <summary>Optional gate, so a project can mark which colliders are editable.</summary>
        public System.Func<Transform, bool> Filter { get; set; }

        /// <summary>Walks up to the outermost parent that passes <see cref="Filter"/>.</summary>
        public bool SelectRoot { get; set; }

        public bool TryPick(Ray ray, Camera camera, out IGizmoTarget target)
        {
            target = null;

            var count = Physics.RaycastNonAlloc(ray, _hits, MaxDistance, LayerMask, QueryTriggerInteraction.Ignore);
            if (count <= 0) return false;

            var bestDistance = float.MaxValue;
            Transform best = null;

            for (var i = 0; i < count; i++)
            {
                var hit = _hits[i];
                if (hit.distance >= bestDistance) continue;

                var candidate = SelectRoot ? hit.transform.root : hit.transform;
                if (Filter != null && !Filter(candidate)) continue;

                bestDistance = hit.distance;
                best = candidate;
            }

            if (best == null) return false;

            target = new TransformGizmoTarget(best);
            return true;
        }
    }
}
