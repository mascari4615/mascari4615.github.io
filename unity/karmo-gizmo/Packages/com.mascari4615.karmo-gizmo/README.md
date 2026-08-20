# Karmo Gizmo

Runtime transform gizmo for Unity. Move, rotate and scale handles that work in a
built player, not just in the editor.

The point of this package is not the three tools it ships with. It is that every
part of it is a seam you can replace: input, picking, snapping, undo, pivot,
frame, drawing, selection, the tool set, and even what counts as a "thing that
can be moved".

## Install

Unity 6000.0 or newer.

```
https://github.com/Mascari4615/Mascari4615.github.io.git?path=/unity/karmo-gizmo/Packages/com.mascari4615.karmo-gizmo
```

Works with the built-in pipeline and with URP out of the box. The package
references no pipeline assembly - it submits one vertex-coloured mesh through
`Graphics.DrawMesh`, which every pipeline honours.

## Use

Drop a `GizmoController` on any object, point it at a camera, and give the things
you want to move a collider.

```csharp
var controller = gameObject.AddComponent<GizmoController>();
controller.Camera = Camera.main;
controller.Selection.Set(new TransformGizmoTarget(someTransform));
```

Default bindings: `W` move, `E` rotate, `R` scale, `T` universal, `X` toggle
local/world, `Ctrl` snap, `Shift` uniform/add-to-selection, `Alt` precision,
`Esc` cancel the drag, `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo.

## Extension points

| Interface | Replace it to |
| --- | --- |
| `IGizmoTarget` | Edit something that is not a `Transform` - a level-editor record, an ECS entity, a networked proxy |
| `IGizmoSelection` | Bind to the host app's own selection instead of keeping a second copy of the truth |
| `IGizmoTool` / `IGizmoHandle` | Add manipulation the built-ins do not cover - a wall length handle, a spline tangent |
| `IGizmoInput` | Drive the gizmo from touch, a VR controller ray, a phone acting as a 6DoF camera, or a scripted test |
| `IGizmoPicker` | Decide what a click selected without asking physics |
| `ISnapProvider` | Grid, angle, vertex or surface snapping - `CompositeSnapProvider` stacks them |
| `IGizmoUndo` | Forward gizmo edits into an existing undo stack so they interleave correctly |
| `IPivotStrategy` | Anchor the gizmo somewhere domain-specific |
| `IGizmoDrawer` | Render the same gizmo through a UI overlay, a custom SRP pass, a stylised shader |
| `IGizmoFrameProvider` | Supply the axes for `TransformSpace.Custom` - a grid, a surface normal, a bone |

Everything is a settable property on `GizmoController`, so a replacement can be
swapped in at runtime without subclassing anything.

## How a drag works

Handles never write to a target. When a drag begins the controller snapshots every
selected target's pose; each frame the active handle reports a `TransformDelta`
describing the **total** change since the drag started, and the controller replays
that onto the snapshots.

That is what makes snapping exact instead of drifting, undo a single before/after
pair instead of a stream of increments, and cancelling a drag a plain restore.

## Testing

`GizmoMath` holds the geometry as pure functions, so drag behaviour is verified in
EditMode without a scene or play mode. Run the `Mascari4615.KarmoGizmo.Tests.EditMode`
suite from the Test Runner.

## Credits

Written from scratch, but the shape of the problem is well trodden and these MIT
projects were read while working out the maths and the layout:

- [manaporkun/UnityRuntimeTransformHandles](https://github.com/manaporkun/UnityRuntimeTransformHandles) (MIT, Orkun Manap)
- [HiddenMonk/Unity3DRuntimeTransformGizmo](https://github.com/HiddenMonk/Unity3DRuntimeTransformGizmo) (MIT, HiddenMonk)
- [yasirkula/UnityRuntimeSceneGizmo](https://github.com/yasirkula/UnityRuntimeSceneGizmo) (MIT, yasirkula)

No code was copied from them.

## License

MIT. See `LICENSE.md`.
