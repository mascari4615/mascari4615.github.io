"""티메토 v3 — 둥근 덩어리(블록감 X) + 픽셀 텍스처 + 2등신.

사용자 지시 반영:
  · 화면 픽셀 필터 X — 픽셀은 *텍스처*가 낸다 (뷰어는 풀 해상도)
  · 몸은 더 작게, 머리는 짧고 둥글게 (BOOTH 2頭身 소체 비율)
  · 블록/큐브 느낌 제거 — 구·캡슐 기반, 낮은 세그먼트로 면만 살짝 보이게

비율 (총 2.20):
  머리   0.94 ~ 2.14  (지름 1.20, 전체의 55%)
  몸통   0.50 ~ 0.96
  다리   0.10 ~ 0.52
  발     0.00 ~ 0.16
실행: blender -b -P build5.py
"""
import math
import os

import bpy
import bmesh
from mathutils import Vector, Euler

HERE = r"C:\Users\masca\work\timeto-3d"
OUT = os.path.join(HERE, "out5")
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
HEAD_R = 0.60
HEAD_Z = 1.54


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
    h = 1.5   # 영역 안쪽으로 넉넉히 (구면 UV 가 가장자리를 물지 않게)
    return ((x0 + h) / TEX, 1.0 - (y1 - h) / TEX,
            (x1 - h) / TEX, 1.0 - (y0 + h) / TEX)


def paint(obj, region, spread=0.55):
    """UV 를 영역 안쪽에 몰아 넣는다 = 단색 덩어리. 픽셀 텍스처의 색만 쓴다."""
    me = obj.data
    u0, v0, u1, v1 = uv_rect(region)
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    hw, hh = (u1 - u0) / 2 * spread, (v1 - v0) / 2 * spread
    uv = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    # 정점 법선 기준으로 영역 안에서 살짝 흩어 놓아 텍스처 결이 보이게
    for poly in me.polygons:
        for li in poly.loop_indices:
            n = me.vertices[me.loops[li].vertex_index].normal
            uv.data[li].uv = (cu + n.x * hw, cv + n.z * hh)
    me.materials.append(MAT)
    for p in me.polygons:
        p.use_smooth = False
    return obj


def ball(name, r, loc, scale=(1, 1, 1), segs=12, rings=7, region="SKIN", rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.rotation_euler = Euler(rot)
    return paint(o, region)


def capsule(name, r, length, loc, segs=8, region="SKIN", rot=(0, 0, 0), taper=1.0):
    """둥근 기둥 — 위아래가 둥글다 (블록감 0)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=r, depth=length, location=loc)
    o = bpy.context.object
    o.name = name
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    # 끝면을 안쪽으로 당겨 둥글게
    for v in bm.verts:
        if v.co.z > length / 2 - 1e-4:
            v.co.x *= 0.55 * taper
            v.co.y *= 0.55 * taper
            v.co.z += r * 0.35
        elif v.co.z < -length / 2 + 1e-4:
            v.co.x *= 0.55
            v.co.y *= 0.55
            v.co.z -= r * 0.35
    bm.to_mesh(me)
    bm.free()
    o.rotation_euler = Euler(rot)
    return paint(o, region)


def face_patch():
    """얼굴 = 머리 앞면에 붙는 구면 패치. 24x24 텍셀 = 굵은 픽셀."""
    mesh = bpy.data.meshes.new("face")
    obj = bpy.data.objects.new("face", mesh)
    bpy.context.collection.objects.link(obj)
    NU = NV = 5
    au, av = math.radians(52), math.radians(46)
    Rr = HEAD_R * 1.015
    verts, faces = [], []
    for j in range(NV + 1):
        for i in range(NU + 1):
            u = -au + 2 * au * (i / NU)
            v = -av + 2 * av * (j / NV)
            verts.append((Rr * math.sin(u) * math.cos(v) * 1.02,
                          -Rr * math.cos(u) * math.cos(v) * 0.96,
                          Rr * math.sin(v) * 0.92))
    for j in range(NV):
        for i in range(NU):
            a = j * (NU + 1) + i
            faces.append((a, a + 1, a + NU + 2, a + NU + 1))
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    u0, v0, u1, v1 = uv_rect("FACE")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            i, j = vi % (NU + 1), vi // (NU + 1)
            uv.data[li].uv = (u0 + (i / NU) * (u1 - u0), v0 + (j / NV) * (v1 - v0))
    mesh.materials.append(MAT)
    for p in mesh.polygons:
        p.use_smooth = False
    obj.location = (0, 0, HEAD_Z - 0.04)
    return obj


def strand(name, r, length, loc, region="HAIRFLAT", rot=(0, 0, 0)):
    """머리카락 다발 — 끝이 둥글게 가늘어지는 덩어리 (뾰족한 피라미드 X)."""
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=r, radius2=r * 0.34,
                                    depth=length, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return paint(o, region)


def build():
    global MAT
    clear()
    MAT = make_material()

    # 머리 — 세로로 짧고 가로로 넓은 둥근 덩어리
    ball("head", HEAD_R, (0, 0, HEAD_Z), (1.04, 0.98, 0.90), 14, 9, "SKIN")
    face_patch()

    # 머리카락: 머리를 덮는 둥근 셸 (윗면·뒤·옆) — 앞이마만 열림
    hair = ball("hair", HEAD_R * 1.08, (0, 0.03, HEAD_Z + 0.04), (1.05, 1.04, 0.94), 14, 9, "HAIR")
    me = hair.data
    bm = bmesh.new(); bm.from_mesh(me)
    doomed = [f for f in bm.faces if f.calc_center_median().y < -0.14 and f.calc_center_median().z < 0.10]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(me); bm.free()

    # 앞머리 다발 — 둥글게 내려옴
    for k, ang in enumerate((-46, -22, 0, 22, 46)):
        a = math.radians(ang)
        ln = (0.34, 0.26)[k % 2]
        strand(f"bang_{k}", 0.15, ln,
               (math.sin(a) * HEAD_R * 0.86, -math.cos(a) * HEAD_R * 0.86, HEAD_Z + 0.22 - ln * 0.3),
               rot=(math.radians(172), 0, a))
    # 사이드 다발
    for sgn in (-1, 1):
        strand(f"side_{sgn}", 0.17, 0.62, (sgn * 0.54, -0.06, HEAD_Z - 0.30),
               rot=(math.radians(180), 0, math.radians(sgn * 8)))
    # 뒷머리 덩어리
    ball("backhair", HEAD_R * 0.80, (0, 0.34, HEAD_Z - 0.10), (1.16, 0.92, 0.96), 12, 7, "HAIRDARK")
    # 아호게
    strand("ahoge", 0.055, 0.30, (0.05, 0.10, HEAD_Z + 0.62), rot=(math.radians(20), 0, 0))

    # 몸 — 작고 둥글게 (0.50 ~ 0.96)
    capsule("torso", 0.24, 0.34, (0, 0, 0.73), segs=10, region="TORSO_S", taper=0.9)
    # 가운 자락
    ball("skirt", 0.30, (0, 0, 0.60), (1.06, 0.94, 0.52), 12, 6, "COAT")
    # 리본
    ball("ribbon", 0.07, (0, -0.20, 0.88), (1.5, 0.6, 0.7), 8, 5, "HAIRFLAT")

    # 팔 — 짧고 둥근 몽둥이
    for sgn in (-1, 1):
        capsule(f"arm_{sgn}", 0.085, 0.24, (sgn * 0.27, 0, 0.76), segs=7, region="ARM",
                rot=(0, math.radians(sgn * 16), 0))
        ball(f"hand_{sgn}", 0.085, (sgn * 0.33, 0, 0.58), (1, 1, 0.9), 8, 5, "SKIN")

    # 다리 + 발
    for sgn in (-1, 1):
        capsule(f"leg_{sgn}", 0.095, 0.26, (sgn * 0.13, 0, 0.32), segs=7, region="LEG")
        ball(f"foot_{sgn}", 0.115, (sgn * 0.13, -0.04, 0.10), (1.0, 1.35, 0.72), 8, 5, "BOOT")


def setup_render():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 320
    scene.render.resolution_y = 320
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.88, 0.88, 0.96, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.75

    key = bpy.data.lights.new("key", "SUN")
    key.energy = 1.4
    ko = bpy.data.objects.new("key", key)
    bpy.context.collection.objects.link(ko)
    ko.rotation_euler = Euler((math.radians(56), 0, math.radians(-34)))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.9
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def render_turnaround(cam):
    target = Vector((0, 0, 1.08))
    dist, elev = 6.0, math.radians(6)
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
for _p in (os.path.join(OUT, "timeto_v3.glb"), os.path.join(HERE, "viewer", "timeto.glb")):
    bpy.ops.export_scene.gltf(filepath=_p, export_format="GLB", export_apply=True)

for o in bpy.data.objects:
    if o.type == "MESH":
        o.data.calc_loop_triangles()
tris = sum(len(o.data.loop_triangles) for o in bpy.data.objects if o.type == "MESH")
print(f"[STATS] parts={len([o for o in bpy.data.objects if o.type=='MESH'])} tris={tris}")
print("[DONE]", ", ".join(os.path.basename(p) for p in paths))
