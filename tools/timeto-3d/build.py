"""티메토 로우폴리 v0 — Blender 헤드리스 빌드 + 턴어라운드 렌더 + glTF 내보내기.

실행: blender -b -P build.py
정면 = -Y. 카메라가 Z축으로 돌며 4각(정면/45/측/후면) 렌더.
"""
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(bpy.data.filepath or __file__))
if not HERE or not os.path.isdir(HERE):
    HERE = os.path.dirname(os.path.abspath(sys.argv[0]))
HERE = r"C:\Users\masca\work\timeto-3d"
ATLAS = os.path.join(HERE, "atlas.png")
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

TEX = 128.0

# 아틀라스 영역 (px 좌상단 원점) — tex.py 와 동기
R = {
    "FACE":    (0, 0, 64, 64),
    "HAIR":    (64, 0, 128, 64),
    "TORSO_F": (0, 64, 64, 96),
    "TORSO_S": (64, 64, 96, 96),
    "ARM":     (96, 64, 128, 96),
    "LEG":     (0, 96, 32, 128),
    "BOOT":    (32, 96, 64, 128),
    "HAIRFLAT": (64, 96, 96, 128),
    "SKIN":    (96, 96, 128, 128),
}


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material():
    mat = bpy.data.materials.new("timeto_atlas")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    img = nt.nodes.new("ShaderNodeTexImage")
    img.image = bpy.data.images.load(ATLAS)
    img.interpolation = "Closest"
    img.extension = "CLIP"
    nt.links.new(img.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


MAT = None


def uv_rect(name):
    x0, y0, x1, y1 = R[name]
    # 픽셀 경계에서 반 텍셀 안쪽 (nearest bleed 방지)
    h = 0.5
    return (
        (x0 + h) / TEX,
        1.0 - (y1 - h) / TEX,
        (x1 - h) / TEX,
        1.0 - (y0 + h) / TEX,
    )


def box(name, size, loc, faces, parent=None):
    """size=(sx,sy,sz), loc=중심. faces = {'front','back','left','right','top','bottom'} → 영역명.
    누락 키는 'default' 사용."""
    sx, sy, sz = size
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    uv_layer = bm.loops.layers.uv.new("UVMap")

    for f in bm.faces:
        n = f.normal
        if abs(n.z) > 0.5:
            key = "top" if n.z > 0 else "bottom"
            axes = (0, 1)
        elif abs(n.y) > 0.5:
            key = "front" if n.y < 0 else "back"
            axes = (0, 2)
        else:
            key = "right" if n.x > 0 else "left"
            axes = (1, 2)
        region = faces.get(key, faces.get("default", "SKIN"))
        u0, v0, u1, v1 = uv_rect(region)
        dims = (sx, sy, sz)
        ai, bi = axes
        for loop in f.loops:
            co = loop.vert.co
            a = co[ai] / dims[ai] + 0.5
            b = co[bi] / dims[bi] + 0.5
            # 좌우 반전 보정: -Y(front)/+X 면은 그대로, 반대편은 뒤집어 대칭 유지
            if key in ("back", "left"):
                a = 1.0 - a
            loop[uv_layer].uv = (u0 + a * (u1 - u0), v0 + b * (v1 - v0))

    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(MAT)
    obj.location = Vector(loc)
    if parent:
        obj.parent = parent
    return obj


def build():
    global MAT
    clear()
    MAT = make_material()

    root = bpy.data.objects.new("timeto", None)
    bpy.context.collection.objects.link(root)

    HEAD_Z = 1.52
    head = box("head", (0.98, 0.90, 0.94), (0, 0, HEAD_Z),
               {"front": "FACE", "default": "HAIR"}, root)

    # 사이드 번 2개 (라벤더, 얼굴 옆으로 내려옴)
    for sgn in (-1, 1):
        box(f"sideburn_{sgn}", (0.16, 0.40, 0.78),
            (sgn * 0.56, -0.16, HEAD_Z - 0.30),
            {"default": "HAIRFLAT"}, root)
    # 뒷머리 볼륨
    box("backhair", (1.02, 0.34, 0.92), (0, 0.52, HEAD_Z - 0.08),
        {"default": "HAIR"}, root)
    # 아호게
    box("ahoge_a", (0.09, 0.09, 0.34), (0.02, 0.14, HEAD_Z + 0.60),
        {"default": "HAIRFLAT"}, root)
    box("ahoge_b", (0.24, 0.08, 0.09), (0.14, 0.14, HEAD_Z + 0.74),
        {"default": "HAIRFLAT"}, root)

    # 상체 (가운)
    box("torso", (0.62, 0.42, 0.62), (0, 0, 0.74),
        {"front": "TORSO_F", "default": "TORSO_S"}, root)
    # 가운 자락 (아래로 살짝 퍼짐)
    box("coat_hem", (0.72, 0.48, 0.20), (0, 0.02, 0.50),
        {"front": "TORSO_F", "default": "TORSO_S"}, root)

    # 팔
    for sgn in (-1, 1):
        box(f"arm_{sgn}", (0.18, 0.18, 0.60), (sgn * 0.44, 0, 0.78),
            {"default": "ARM"}, root)

    # 다리 + 부츠
    for sgn in (-1, 1):
        box(f"leg_{sgn}", (0.20, 0.20, 0.34), (sgn * 0.17, 0, 0.32),
            {"default": "LEG"}, root)
        box(f"boot_{sgn}", (0.24, 0.30, 0.20), (sgn * 0.17, -0.03, 0.10),
            {"default": "BOOT"}, root)

    return root


def setup_render():
    scene = bpy.context.scene
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    print("[ENGINE]", scene.render.engine)
    scene.render.resolution_x = 220
    scene.render.resolution_y = 220
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 4.0
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def render_turnaround(cam):
    target = Vector((0, 0, 1.25))
    dist = 5.0
    elev = math.radians(8)
    paths = []
    for i, deg in enumerate((0, 45, 90, 180)):
        a = math.radians(deg)
        cam.location = Vector((
            math.sin(a) * dist * math.cos(elev),
            -math.cos(a) * dist * math.cos(elev),
            target.z + math.sin(elev) * dist,
        ))
        direction = target - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        p = os.path.join(OUT, f"turn_{i}_{deg}.png")
        bpy.context.scene.render.filepath = p
        bpy.ops.render.render(write_still=True)
        paths.append(p)
    return paths


root = build()
cam = setup_render()
paths = render_turnaround(cam)

bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "timeto.glb"),
    export_format="GLB",
    export_apply=True,
)

tris = sum(len(o.data.loop_triangles) for o in bpy.data.objects if o.type == "MESH")
for o in bpy.data.objects:
    if o.type == "MESH":
        o.data.calc_loop_triangles()
tris = sum(len(o.data.loop_triangles) for o in bpy.data.objects if o.type == "MESH")
verts = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH")
print(f"[STATS] objects={len([o for o in bpy.data.objects if o.type=='MESH'])} verts={verts} tris={tris}")
print("[DONE]", ", ".join(os.path.basename(p) for p in paths))
