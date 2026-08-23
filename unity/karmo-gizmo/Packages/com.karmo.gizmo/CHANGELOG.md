# Changelog

All notable changes to this package are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial architecture: `GizmoController`, pluggable `IGizmoInput` / `IGizmoPicker` /
  `ISnapProvider` / `IGizmoUndo` / `IPivotStrategy` / `IGizmoDrawer` / `IGizmoTarget`.
- Move / Rotate / Scale / Universal tools built from composable `IGizmoHandle` parts.
- `GizmoMath` primitives (ray-ray closest point, ray-plane, screen-space distance,
  constant screen size) with EditMode tests.
