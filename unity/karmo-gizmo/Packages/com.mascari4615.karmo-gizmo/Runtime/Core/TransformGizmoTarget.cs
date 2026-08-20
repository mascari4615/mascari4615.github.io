using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>Default <see cref="IGizmoTarget"/>: a plain Unity <see cref="Transform"/>.</summary>
    public sealed class TransformGizmoTarget : IGizmoTarget
    {
        private readonly Transform _transform;

        public TransformGizmoTarget(Transform transform)
        {
            _transform = transform;
        }

        public Transform Transform => _transform;
        public object Id => _transform;
        public bool IsValid => _transform != null;

        public Vector3 Position
        {
            get => _transform.position;
            set => _transform.position = value;
        }

        public Quaternion Rotation
        {
            get => _transform.rotation;
            set => _transform.rotation = value;
        }

        public Vector3 LocalScale
        {
            get => _transform.localScale;
            set => _transform.localScale = value;
        }

        public Quaternion ParentRotation =>
            _transform.parent != null ? _transform.parent.rotation : Quaternion.identity;

        public Bounds WorldBounds
        {
            get
            {
                var bounds = new Bounds(_transform.position, Vector3.zero);
                var renderers = _transform.GetComponentsInChildren<Renderer>();
                var initialised = false;
                for (var i = 0; i < renderers.Length; i++)
                {
                    if (!renderers[i].enabled) continue;
                    if (!initialised)
                    {
                        bounds = renderers[i].bounds;
                        initialised = true;
                    }
                    else
                    {
                        bounds.Encapsulate(renderers[i].bounds);
                    }
                }

                return bounds;
            }
        }

        public override bool Equals(object obj) =>
            obj is TransformGizmoTarget other && other._transform == _transform;

        public override int GetHashCode() =>
            _transform != null ? _transform.GetHashCode() : 0;
    }
}
