"""티메토 로우폴리 v2 — v0(텍스처 주도, 또렷)의 장점 유지 + 각진 큐브 탈피.

레퍼런스 실측 반영:
  · 렌더 캔버스 90px, 캐릭터 58px  → 텍셀 밀도 1:1
  · 전신 아틀라스 64x64 (눈 4x5 텍셀)
  · 실루엣만 폴리로 — 300tri 내외
  · 조명은 약하게 (면 구분만) — 색은 텍스처가 낸다

실행: blender -b -P build3.py
"""
import math
import os

import bpy
import bmesh
from mathutils import Vector, Euler

HERE = r"C:\Users\masca\work\timeto-3d"
OUT = os.path.join(HERE, "out3")
os.makedirs(OUT, exist_ok=True)
ATLAS = os.path.join(HERE, "atlas64.png")

TEX = 64.0
R = {
    "FACE":     (0, 0, 24, 24),
    "HAIR":     (24, 0, 48, 24),
    "HAIRFLAT": (48, 0, 64, 16),
    "HAIRDARK": (48, 16, 64, 24),
    "TORSO_F":  (0, 24, 24, 48),
    "TORSO_S":  (24, 24, 44, 48),
    "ARM":      (44, 24, 56, 48),
    "LEG":      (0, 48, 16, 64),
    "BOOT":     (16, 48, 32, 64),
    "SKIN":     (32, 48, 48, 64),
    "COAT":     (48, 48, 64, 64),
}

MAT = None


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material():
    mat = bpy.data.materials.new("atlas")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    img = nt.nodes.new("ShaderNodeTexImage")
    img.image = bpy.data.images.load(ATLAS)
    img.interpolation = "Closest"
    img.extension = "CLIP"
    nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    return mat


def uv_rect(name):
    x0, y0, x1, y1 = R[name]
    h = 0.5
    return ((x0 + h) / TEX, 1.0 - (y1 - h) / TEX,
            (x1 - h) / TEX, 1.0 - (y0 + h) / TEX)


def shape(name, size, loc, faces, bevel=0.0, taper=1.0, rot=(0, 0, 0)):
    """모서리 깎은 상자. taper<1 = 위가 좁아짐. faces: front/back/left/right/top/bottom/default."""
    sx, sy, sz = size
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        t = 1.0 if v.co.z < 0 else taper
        v.co.x *= sx * t
        v.co.y *= sy * t
        v.co.z *= sz
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                        offset=bevel, segments=1, profile=0.5, affect="EDGES")

    uv_layer = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        if ax == 2:
            key, axes = ("top" if n.z > 0 else "bottom"), (0, 1)
        elif ax == 1:
            key, axes = ("front" if n.y < 0 else "back"), (0, 2)
        else:
            key, axes = ("right" if n.x > 0 else "left"), (1, 2)
        # 얼굴 텍스처는 진짜 정면(법선이 거의 -Y)에만
        region = faces.get(key, faces.get("default", "SKIN"))
        if region == "FACE" and n.y > -0.85:
            region = faces.get("default", "SKIN")
        u0, v0, u1, v1 = uv_rect(region)
        dims = (sx, sy, sz)
        ai, bi = axes
        for loop in f.loops:
            co = loop.vert.co
            a = min(max(co[ai] / dims[ai] + 0.5, 0.0), 1.0)
            b = min(max(co[bi] / dims[bi] + 0.5, 0.0), 1.0)
            if key in ("back", "left"):
                a = 1.0 - a
            loop[uv_layer].uv = (u0 + a * (u1 - u0), v0 + b * (v1 - v0))

    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(MAT)
    for p in mesh.polygons:
        p.use_smooth = False
    obj.location = Vector(loc)
    obj.rotation_euler = Euler(rot)
    return obj


def spike(name, base, length, loc, region="HAIRFLAT", rot=(0, 0, 0)):
    """4면 피라미드 = 머리카락 결. 6 tri."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    b = base * 0.5
    verts = [(-b, -b, 0), (b, -b, 0), (b, b, 0), (-b, b, 0), (0, 0, -length)]
    faces = [(0, 1, 2, 3), (0, 4, 1), (1, 4, 2), (2, 4, 3), (3, 4, 0)]
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    u0, v0, u1, v1 = uv_rect(region)
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv = (u0 + (co.x / base + 0.5) * (u1 - u0) * 0.9,
                              v0 + (co.y / base + 0.5) * (v1 - v0) * 0.9)
    mesh.materials.append(MAT)
    for p in mesh.polygons:
        p.use_smooth = False
    obj.location = Vector(loc)
    obj.rotation_euler = Euler(rot)
    return obj


def build():
    global MAT
    clear()
    MAT = make_material()

    # 2등신 — 총 높이 2.4, 머리 덩어리(머리카락 포함) = 1.15 (48%)
    HZ = 1.67          # 머리 중심 (1.24 ~ 2.10)

    shape("head", (0.98, 0.86, 0.86), (0, 0, HZ),
          {"front": "FACE", "default": "HAIR"}, bevel=0.10)
    # 정수리 머리카락 덩어리
    shape("hair_top", (1.02, 0.92, 0.30), (0, 0.02, HZ + 0.50),
          {"default": "HAIR"}, bevel=0.09)

    # 앞머리 결 — 크게 3개 + 작게 2개
    for k, (x, ln) in enumerate(((-0.30, 0.34), (-0.10, 0.24), (0.10, 0.36), (0.30, 0.26))):
        spike(f"bang_{k}", 0.26, ln, (x, -0.42, HZ + 0.34),
              rot=(math.radians(7), 0, 0))
    # 옆으로 삐친 큰 결
    for sgn in (-1, 1):
        spike(f"spike_{sgn}", 0.28, 0.40, (sgn * 0.48, -0.04, HZ + 0.34),
              rot=(0, math.radians(sgn * 52), 0))
    # 사이드번 — 굵게, 턱 아래까지
    for sgn in (-1, 1):
        shape(f"sideburn_{sgn}", (0.18, 0.42, 0.66), (sgn * 0.50, -0.10, HZ - 0.30),
              {"default": "HAIRFLAT"}, bevel=0.05, taper=1.2)
    # 뒷머리 덩어리
    shape("backhair", (0.92, 0.30, 0.78), (0, 0.48, HZ - 0.06),
          {"default": "HAIRDARK"}, bevel=0.08)
    # 아호게 (정수리에 붙임)
    spike("ahoge", 0.11, 0.34, (0.06, 0.10, HZ + 0.98),
          rot=(math.radians(200), 0, 0))

    # 몸통 0.74~1.24 (짧고 통통)
    shape("torso", (0.52, 0.36, 0.50), (0, 0, 0.99),
          {"front": "TORSO_F", "default": "TORSO_S"}, bevel=0.06, taper=0.86)
    # 가운 자락 0.48~0.80
    shape("skirt", (0.66, 0.46, 0.32), (0, 0, 0.64),
          {"front": "TORSO_F", "default": "TORSO_S"}, bevel=0.05, taper=0.72)

    # 팔 — 굵고 짧게
    for sgn in (-1, 1):
        shape(f"arm_{sgn}", (0.17, 0.17, 0.44), (sgn * 0.36, 0, 1.00),
              {"default": "ARM"}, bevel=0.045, taper=1.05,
              rot=(0, math.radians(sgn * 8), 0))
    # 다리 0.18~0.52 + 큰 부츠 0~0.22
    for sgn in (-1, 1):
        shape(f"leg_{sgn}", (0.18, 0.18, 0.34), (sgn * 0.17, 0, 0.35),
              {"default": "LEG"}, bevel=0.035)
        shape(f"boot_{sgn}", (0.24, 0.32, 0.22), (sgn * 0.17, -0.04, 0.11),
              {"default": "BOOT"}, bevel=0.05)


def setup_render():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 90
    scene.render.resolution_y = 90
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filter_size = 0.4
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.86, 0.95, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.72

    key = bpy.data.lights.new("key", "SUN")
    key.energy = 1.35
    ko = bpy.data.objects.new("key", key)
    bpy.context.collection.objects.link(ko)
    ko.rotation_euler = Euler((math.radians(56), 0, math.radians(-34)))

    rim = bpy.data.lights.new("rim", "SUN")
    rim.energy = 0.7
    rim.color = (1.0, 0.9, 0.98)
    ro = bpy.data.objects.new("rim", rim)
    bpy.context.collection.objects.link(ro)
    ro.rotation_euler = Euler((math.radians(108), 0, math.radians(200)))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 3.6      # 캐릭터 ≈ 58 / 90 px
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def render_turnaround(cam):
    target = Vector((0, 0, 1.20))
    dist, elev = 6.0, math.radians(7)
    paths = []
    for i, deg in enumerate((0, 45, 90, 180)):
        a = math.radians(deg)
        cam.location = Vector((math.sin(a) * dist * math.cos(elev),
                               -math.cos(a) * dist * math.cos(elev),
                               target.z + math.sin(elev) * dist))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        p = os.path.join(OUT, f"turn_{i}_{deg}.png")
        scene = bpy.context.scene
        scene.render.filepath = p
        bpy.ops.render.render(write_still=True)
        paths.append(p)
    return paths


build()
cam = setup_render()
paths = render_turnaround(cam)
for _p in (os.path.join(OUT, "timeto_v2.glb"), os.path.join(HERE, "viewer", "timeto.glb")):
    os.makedirs(os.path.dirname(_p), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=_p, export_format="GLB", export_apply=True)

for o in bpy.data.objects:
    if o.type == "MESH":
        o.data.calc_loop_triangles()
tris = sum(len(o.data.loop_triangles) for o in bpy.data.objects if o.type == "MESH")
verts = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH")
print(f"[STATS] parts={len([o for o in bpy.data.objects if o.type=='MESH'])} verts={verts} tris={tris}")
print("[DONE]", ", ".join(os.path.basename(p) for p in paths))
