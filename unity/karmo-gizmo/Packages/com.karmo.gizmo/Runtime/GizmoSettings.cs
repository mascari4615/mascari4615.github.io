using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Tunables that describe how the gizmo behaves, kept as an asset so a project can
    /// carry several profiles (a heavy level-editor feel, a light in-game placement
    /// feel) and swap them at runtime without touching code.
    /// </summary>
    [CreateAssetMenu(menuName = "Karmo Gizmo/Gizmo Settings", fileName = "GizmoSettings")]
    public sealed class GizmoSettings : ScriptableObject
    {
        [Header("Size")]
        [Tooltip("Height of the gizmo in pixels, held constant regardless of distance.")]
        [SerializeField] private float _screenSizeInPixels = 120f;

        [Tooltip("Pointer slack when picking a handle, in pixels.")]
        [SerializeField] private float _pickToleranceInPixels = 12f;

        [Header("Snapping")]
        [SerializeField] private bool _snapByDefault;
        [SerializeField] private Vector3 _translationStep = Vector3.one;
        [SerializeField] private float _rotationStepInDegrees = 15f;
        [SerializeField] private float _scaleStep = 0.1f;

        [Tooltip("Multiplier applied while the precision modifier is held.")]
        [SerializeField, Range(0.01f, 1f)] private float _precisionFactor = 0.1f;

        [Header("Behaviour")]
        [Tooltip("Rotation rings on the far side of the sphere are hidden and unpickable.")]
        [SerializeField] private bool _hideOccludedRotationRings = true;

        [Tooltip("Rotate the gizmo frame with the object while a rotate drag is running.")]
        [SerializeField] private bool _followRotationDuringDrag;

        [Tooltip("Clamp scale so an object can never be flipped inside out by dragging past zero.")]
        [SerializeField] private float _minimumScaleFactor = 0.001f;

        public float ScreenSizeInPixels => _screenSizeInPixels;
        public float PickToleranceInPixels => _pickToleranceInPixels;
        public bool SnapByDefault => _snapByDefault;
        public Vector3 TranslationStep => _translationStep;
        public float RotationStepInDegrees => _rotationStepInDegrees;
        public float ScaleStep => _scaleStep;
        public float PrecisionFactor => _precisionFactor;
        public bool HideOccludedRotationRings => _hideOccludedRotationRings;
        public bool FollowRotationDuringDrag => _followRotationDuringDrag;
        public float MinimumScaleFactor => _minimumScaleFactor;

        /// <summary>Settings used when the controller has no asset assigned.</summary>
        public static GizmoSettings CreateDefault()
        {
            var settings = CreateInstance<GizmoSettings>();
            settings.name = "GizmoSettings (Default)";
            settings.hideFlags = HideFlags.HideAndDontSave;
            return settings;
        }
    }
}
