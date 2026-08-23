namespace Mascari4615.KarmoGizmo
{
    /// <summary>Ids of the tools the package ships with.</summary>
    public static class GizmoToolIds
    {
        public const string Move = "move";
        public const string Rotate = "rotate";
        public const string Scale = "scale";
        public const string Universal = "universal";
    }

    /// <summary>Three axis arrows, three plane quads, one screen-space centre.</summary>
    public sealed class MoveTool : GizmoToolBase
    {
        public MoveTool() : base(GizmoToolIds.Move, "Move")
        {
            for (var axis = 0; axis < 3; axis++) AddHandle(new AxisTranslateHandle(axis));

            AddHandle(new PlaneTranslateHandle(1, 2)); // YZ, normal X
            AddHandle(new PlaneTranslateHandle(0, 2)); // XZ, normal Y
            AddHandle(new PlaneTranslateHandle(0, 1)); // XY, normal Z

            AddHandle(new ScreenTranslateHandle());
        }
    }

    /// <summary>Three axis rings plus the outer view-aligned ring.</summary>
    public sealed class RotateTool : GizmoToolBase
    {
        public RotateTool() : base(GizmoToolIds.Rotate, "Rotate")
        {
            for (var axis = 0; axis < 3; axis++) AddHandle(new AxisRotateHandle(axis));
            AddHandle(new ScreenRotateHandle());
        }
    }

    /// <summary>
    /// Three axis stalks plus a centre box. Pinned to local space: a non-uniform scale
    /// expressed in any other basis cannot be written back into a Transform without
    /// shearing it, so the tool refuses rather than quietly lying.
    /// </summary>
    public sealed class ScaleTool : GizmoToolBase
    {
        public ScaleTool() : base(GizmoToolIds.Scale, "Scale")
        {
            for (var axis = 0; axis < 3; axis++) AddHandle(new AxisScaleHandle(axis));
            AddHandle(new UniformScaleHandle());
        }

        public override bool SupportsSpace(TransformSpace space) => space == TransformSpace.Local;
    }

    /// <summary>
    /// Everything at once, the way the editor's Transform tool works. Handle priority
    /// keeps the overlapping parts from fighting: centre beats planes beats axes.
    /// </summary>
    public sealed class UniversalTool : GizmoToolBase
    {
        public UniversalTool() : base(GizmoToolIds.Universal, "Universal")
        {
            for (var axis = 0; axis < 3; axis++)
            {
                AddHandle(new AxisTranslateHandle(axis));
                AddHandle(new AxisRotateHandle(axis));
            }

            AddHandle(new PlaneTranslateHandle(1, 2));
            AddHandle(new PlaneTranslateHandle(0, 2));
            AddHandle(new PlaneTranslateHandle(0, 1));

            AddHandle(new UniformScaleHandle());
        }

        public override bool SupportsSpace(TransformSpace space) => space == TransformSpace.Local;
    }
}
