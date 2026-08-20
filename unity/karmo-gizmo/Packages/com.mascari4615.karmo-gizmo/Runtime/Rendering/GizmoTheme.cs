using UnityEngine;

namespace Mascari4615.KarmoGizmo
{
    /// <summary>
    /// Every colour and proportion the gizmo draws with. Kept apart from
    /// <see cref="GizmoSettings"/> so look and feel can be re-skinned per project
    /// without disturbing behaviour.
    /// </summary>
    [CreateAssetMenu(menuName = "Karmo Gizmo/Gizmo Theme", fileName = "GizmoTheme")]
    public sealed class GizmoTheme : ScriptableObject
    {
        [Header("Axis colours")]
        [SerializeField] private Color _xAxis = new Color(0.86f, 0.24f, 0.30f);
        [SerializeField] private Color _yAxis = new Color(0.42f, 0.78f, 0.24f);
        [SerializeField] private Color _zAxis = new Color(0.22f, 0.51f, 0.92f);
        [SerializeField] private Color _screenAxis = new Color(0.82f, 0.82f, 0.85f);

        [Header("States")]
        [SerializeField] private Color _hovered = new Color(1f, 0.92f, 0.35f);
        [SerializeField] private Color _active = new Color(1f, 0.78f, 0.15f);
        [SerializeField, Range(0f, 1f)] private float _disabledAlpha = 0.18f;
        [SerializeField, Range(0f, 1f)] private float _planeFillAlpha = 0.28f;

        [Header("Proportions (fractions of the gizmo's screen size)")]
        [SerializeField] private float _axisLength = 1f;
        [SerializeField] private float _arrowHeadLength = 0.22f;
        [SerializeField] private float _arrowHeadRadius = 0.07f;
        [SerializeField] private float _planeOffset = 0.32f;
        [SerializeField] private float _planeSize = 0.22f;
        [SerializeField] private float _rotationRadius = 1f;
        [SerializeField] private float _screenRotationRadius = 1.2f;
        [SerializeField] private float _cubeSize = 0.09f;
        [SerializeField] private float _centerRadius = 0.11f;
        [SerializeField] private float _lineThickness = 2.5f;

        public Color ScreenAxis => _screenAxis;
        public Color Hovered => _hovered;
        public Color Active => _active;
        public float DisabledAlpha => _disabledAlpha;
        public float PlaneFillAlpha => _planeFillAlpha;

        public float AxisLength => _axisLength;
        public float ArrowHeadLength => _arrowHeadLength;
        public float ArrowHeadRadius => _arrowHeadRadius;
        public float PlaneOffset => _planeOffset;
        public float PlaneSize => _planeSize;
        public float RotationRadius => _rotationRadius;
        public float ScreenRotationRadius => _screenRotationRadius;
        public float CubeSize => _cubeSize;
        public float CenterRadius => _centerRadius;
        public float LineThickness => _lineThickness;

        public Color AxisColor(int axisIndex)
        {
            switch (axisIndex)
            {
                case 0: return _xAxis;
                case 1: return _yAxis;
                case 2: return _zAxis;
                default: return _screenAxis;
            }
        }

        /// <summary>Colour for an axis in a given interaction state.</summary>
        public Color Resolve(int axisIndex, GizmoHandleState state)
        {
            switch (state)
            {
                case GizmoHandleState.Hovered:
                    return _hovered;
                case GizmoHandleState.Active:
                    return _active;
                case GizmoHandleState.Disabled:
                {
                    var color = AxisColor(axisIndex);
                    color.a *= _disabledAlpha;
                    return color;
                }
                default:
                    return AxisColor(axisIndex);
            }
        }

        public static GizmoTheme CreateDefault()
        {
            var theme = CreateInstance<GizmoTheme>();
            theme.name = "GizmoTheme (Default)";
            theme.hideFlags = HideFlags.HideAndDontSave;
            return theme;
        }
    }
}
