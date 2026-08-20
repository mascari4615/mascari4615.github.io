using System.Collections.Generic;
using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Quantises a drag. Implement this for anything a project calls "aligned":
    /// a hex grid, a building's stud spacing, the surface of whatever is underneath,
    /// the nearest vertex of a neighbouring mesh.
    /// </summary>
    public interface ISnapProvider
    {
        /// <summary>Snaps a world-space offset. <paramref name="axes"/> is the frame it was measured in.</summary>
        Vector3 SnapTranslation(Vector3 translation, Quaternion axes, in GizmoContext context);

        /// <summary>Snaps an angle in degrees about <paramref name="axis"/>.</summary>
        float SnapAngle(float angleInDegrees, Vector3 axis, in GizmoContext context);

        /// <summary>Snaps a per-axis scale multiplier.</summary>
        Vector3 SnapScale(Vector3 scale, in GizmoContext context);
    }

    /// <summary>Regular grid / angle / scale steps taken from <see cref="GizmoSettings"/>.</summary>
    public sealed class StepSnapProvider : ISnapProvider
    {
        public Vector3 SnapTranslation(Vector3 translation, Quaternion axes, in GizmoContext context)
        {
            var settings = context.Settings;
            if (settings == null) return translation;

            var local = Quaternion.Inverse(axes) * translation;
            local = GizmoMath.Snap(local, settings.TranslationStep);
            return axes * local;
        }

        public float SnapAngle(float angleInDegrees, Vector3 axis, in GizmoContext context)
        {
            var settings = context.Settings;
            return settings == null
                ? angleInDegrees
                : GizmoMath.Snap(angleInDegrees, settings.RotationStepInDegrees);
        }

        public Vector3 SnapScale(Vector3 scale, in GizmoContext context)
        {
            var settings = context.Settings;
            if (settings == null) return scale;

            var step = settings.ScaleStep;
            return new Vector3(
                GizmoMath.Snap(scale.x, step),
                GizmoMath.Snap(scale.y, step),
                GizmoMath.Snap(scale.z, step));
        }
    }

    /// <summary>
    /// Runs several providers in order, each refining the previous result. Lets a
    /// project stack, say, surface snapping on top of a grid without either knowing
    /// about the other.
    /// </summary>
    public sealed class CompositeSnapProvider : ISnapProvider
    {
        private readonly List<ISnapProvider> _providers = new List<ISnapProvider>();

        public CompositeSnapProvider(params ISnapProvider[] providers)
        {
            if (providers == null) return;
            for (var i = 0; i < providers.Length; i++)
            {
                if (providers[i] != null) _providers.Add(providers[i]);
            }
        }

        public IReadOnlyList<ISnapProvider> Providers => _providers;

        public void Add(ISnapProvider provider)
        {
            if (provider != null) _providers.Add(provider);
        }

        public void Remove(ISnapProvider provider) => _providers.Remove(provider);

        public Vector3 SnapTranslation(Vector3 translation, Quaternion axes, in GizmoContext context)
        {
            for (var i = 0; i < _providers.Count; i++)
            {
                translation = _providers[i].SnapTranslation(translation, axes, context);
            }

            return translation;
        }

        public float SnapAngle(float angleInDegrees, Vector3 axis, in GizmoContext context)
        {
            for (var i = 0; i < _providers.Count; i++)
            {
                angleInDegrees = _providers[i].SnapAngle(angleInDegrees, axis, context);
            }

            return angleInDegrees;
        }

        public Vector3 SnapScale(Vector3 scale, in GizmoContext context)
        {
            for (var i = 0; i < _providers.Count; i++)
            {
                scale = _providers[i].SnapScale(scale, context);
            }

            return scale;
        }
    }
}
