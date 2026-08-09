"""AI 생성 glb 6개 비교 렌더 — 각 모델 정면+45도, 폴리수 출력.

실행: blender -b -P render_ai.py
"""
import glob
import math
import os

import bpy
from mathutils import Vector, Euler

AI = r"C:\Users\masca\work\timeto-3d\ai"
OUT = os.path.join(AI, "preview")
os.makedirs(OUT, exist_ok=True)


def setup(scene):
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 260
    scene.render.resolution_y = 260
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"


for path in sorted(glob.glob(os.path.join(AI, "*.glb"))):
    name = os.path.basename(path)[:-4]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    setup(scene)

    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    tris = 0
    for o in meshes:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)

    # 바운딩 박스로 정규화 (높이 2.0, 바닥 0)
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn[i], w[i]) for i in range(3)))
            mx = Vector((max(mx[i], w[i]) for i in range(3)))
    size = mx - mn
    h = max(size.z, 1e-6)
    s = 2.0 / h
    from mathutils import Matrix
    M = (Matrix.Translation((-(mn.x + mx.x) / 2 * s, -(mn.y + mx.y) / 2 * s, -mn.z * s))
         @ Matrix.Scale(s, 4))
    for o in bpy.data.objects:
        if o.parent is None and o.type in {"MESH", "EMPTY"}:
            o.matrix_world = M @ o.matrix_world

    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.85, 0.94, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    key = bpy.data.lights.new("key", "SUN")
    key.energy = 3.0
    ko = bpy.data.objects.new("key", key)
    bpy.context.collection.objects.link(ko)
    ko.rotation_euler = Euler((math.radians(56), 0, math.radians(-36)))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.6
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    target = Vector((0, 0, 1.0))

    for i, deg in enumerate((0, 40)):
        a = math.radians(deg)
        cam.location = Vector((math.sin(a) * 6, -math.cos(a) * 6, target.z + 0.7))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(OUT, f"{name}_{i}.png")
        bpy.ops.render.render(write_still=True)

    print(f"[MODEL] {name} tris={tris}")
print("[DONE]")
