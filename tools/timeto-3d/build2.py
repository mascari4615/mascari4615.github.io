"""티메토 로우폴리 v1 — 각지지 않은 조각형 + 실제 조명 + 저해상도 렌더.

레퍼런스(caelestisart) 분석 반영:
  · 형태 = 둥근 다면체 + 조각된 머리카락 셸 (박스 조립 X)
  · 셰이딩 = 3점 조명, shade flat → 면마다 밝기 다름
  · 픽셀은 텍스처가 아니라 화면 — 192px 렌더 후 nearest 확대 (compose.py 담당)
  · 얼굴만 알파 데칼, 나머지는 머티리얼 색

실행: blender -b -P build2.py
"""
import math
import os

import bpy
import bmesh
from mathutils import Vector, Euler

HERE = r"C:\Users\masca\work\timeto-3d"
OUT = os.path.join(HERE, "out2")
os.makedirs(OUT, exist_ok=True)

# 팔레트 (KL 티메토 확정 디자인)
C_SKIN = (1.00, 0.86, 0.79)
C_HAIR = (0.70, 0.56, 0.93)
C_HAIR_D = (0.50, 0.38, 0.76)
C_COAT = (0.97, 0.96, 1.00)
C_NAVY = (0.11, 0.14, 0.32)
C_GOLD = (1.00, 0.78, 0.18)
C_BOOT = (0.22, 0.21, 0.34)
C_STOCK = (0.86, 0.84, 0.94)

HEAD_R = 0.52
HEAD_Z = 1.80


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb, rough=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.15
    return m


def face_decal_mat():
    m = bpy.data.materials.new("face_decal")
    m.use_nodes = True
    m.blend_method = "BLEND" if hasattr(m, "blend_method") else m.blend_method
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    img = nt.nodes.new("ShaderNodeTexImage")
    img.image = bpy.data.images.load(os.path.join(HERE, "face.png"))
    img.interpolation = "Closest"
    img.extension = "CLIP"
    nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    trans = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(img.outputs["Alpha"], mix.inputs["Fac"])
    nt.links.new(trans.outputs["BSDF"], mix.inputs[1])
    nt.links.new(bsdf.outputs["BSDF"], mix.inputs[2])
    out = nt.nodes["Material Output"]
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return m


def finish(obj, m, flat=True):
    obj.data.materials.append(m)
    if flat:
        for p in obj.data.polygons:
            p.use_smooth = False
    return obj


def sphere(name, r, loc, scale=(1, 1, 1), segs=12, rings=8, m=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.rotation_euler = Euler(rot)
    return finish(o, m)


def cone(name, r1, r2, depth, loc, verts=8, m=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2,
                                    depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return finish(o, m)


def cut_faces(obj, pred):
    """pred(center_world_local) True 인 면 삭제."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    doomed = [f for f in bm.faces if pred(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(me)
    bm.free()


def face_patch(m):
    """머리 앞면에 밀착한 구면 패치 + UV. 정면 = -Y."""
    mesh = bpy.data.meshes.new("face_patch")
    obj = bpy.data.objects.new("face_patch", mesh)
    bpy.context.collection.objects.link(obj)

    NU, NV = 6, 6
    au, av = math.radians(50), math.radians(38)
    R = HEAD_R * 1.012
    verts, faces, uvs = [], [], []
    for j in range(NV + 1):
        for i in range(NU + 1):
            u = -au + 2 * au * (i / NU)
            v = -av + 2 * av * (j / NV)
            # 머리 스케일(0.98, 0.94, 0.96)에 맞춰 눌러줌
            x = R * math.sin(u) * math.cos(v) * 0.98
            y = -R * math.cos(u) * math.cos(v) * 0.94
            z = R * math.sin(v) * 0.96
            verts.append((x, y, z))
    for j in range(NV):
        for i in range(NU):
            a = j * (NU + 1) + i
            faces.append((a, a + 1, a + NU + 2, a + NU + 1))
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            i = vi % (NU + 1)
            j = vi // (NU + 1)
            uv.data[li].uv = (i / NU, j / NV)
    obj.location = (0, 0, HEAD_Z - 0.06)
    return finish(obj, m)


def build():
    clear()
    m_skin = mat("skin", C_SKIN)
    m_hair = mat("hair", C_HAIR)
    m_hair_d = mat("hair_d", C_HAIR_D)
    m_coat = mat("coat", C_COAT)
    m_navy = mat("navy", C_NAVY)
    m_gold = mat("gold", C_GOLD)
    m_boot = mat("boot", C_BOOT)
    m_stock = mat("stock", C_STOCK)
    m_face = face_decal_mat()

    # ---- 머리 (둥근 다면체, 살짝 눌림)
    sphere("head", HEAD_R, (0, 0, HEAD_Z), (0.98, 0.94, 0.96), 14, 9, m_skin)
    face_patch(m_face)

    # ---- 머리카락: 캡(정수리) + 바깥으로 뻗는 뾰족한 결
    hair = sphere("hair_cap", HEAD_R * 1.09, (0, 0.04, HEAD_Z + 0.06),
                  (1.03, 1.06, 1.0), 14, 9, m_hair)
    # 이마 아래 앞쪽 + 아래쪽 통째 제거 -> 얼굴이 넓게 드러남
    cut_faces(hair, lambda c: (c.y < -0.10 and c.z < 0.16) or c.z < -0.34)

    # 앞머리 결 — 머리 표면 *바깥*에 붙어 아래로 뾰족하게 (실루엣 담당)
    for k, ang in enumerate((-70, -50, -30, -10, 10, 30, 50, 70)):
        a = math.radians(ang)
        length = (0.50, 0.36)[k % 2]
        rr = HEAD_R * 1.02
        cone(f"bang_{k}", 0.13, 0.010, length,
             (math.sin(a) * rr * 0.90, -math.cos(a) * rr * 0.90,
              HEAD_Z + 0.26 - length * 0.42),
             verts=4, m=m_hair,
             rot=(math.radians(172), 0, a))
    # 옆으로 삐친 결 2개 (레퍼런스의 뾰족뾰족한 옆실루엣)
    for sgn in (-1, 1):
        cone(f"spike_{sgn}", 0.13, 0.012, 0.46,
             (sgn * 0.66, 0.10, HEAD_Z + 0.16), verts=4, m=m_hair,
             rot=(math.radians(150), 0, math.radians(sgn * 96)))

    # 사이드 번 2개 — 턱 아래까지 내려오는 다발
    for sgn in (-1, 1):
        cone(f"sideburn_{sgn}", 0.16, 0.045, 0.94,
             (sgn * 0.58, -0.10, HEAD_Z - 0.34), verts=5, m=m_hair,
             rot=(math.radians(182), 0, math.radians(sgn * 6)))
    # 뒷머리 볼륨
    sphere("backhair", HEAD_R * 0.86, (0, 0.36, HEAD_Z - 0.20),
           (1.18, 1.0, 1.08), 12, 8, m_hair_d)

    # 아호게
    cone("ahoge", 0.055, 0.008, 0.40, (0.03, 0.16, HEAD_Z + 0.78),
         verts=5, m=m_hair, rot=(math.radians(24), 0, 0))

    # ---- 몸통 (어깨 1.29 = 턱선에 맞물림)
    cone("coat", 0.25, 0.30, 0.55, (0, 0, 1.02), verts=10, m=m_coat)
    # 가운 자락 — 아래로 크게 퍼짐 (실루엣 담당)
    cone("skirt", 0.30, 0.47, 0.32, (0, 0, 0.64), verts=12, m=m_coat)
    # 이너(남색) 앞판 + 옷깃
    cone("inner", 0.19, 0.225, 0.56, (0, -0.045, 1.02), verts=8, m=m_navy)
    cone("collar", 0.27, 0.20, 0.10, (0, -0.02, 1.27), verts=10, m=m_coat)
    # 노란 리본
    for sgn in (-1, 1):
        cone(f"ribbon_{sgn}", 0.115, 0.02, 0.17,
             (sgn * 0.10, -0.215, 1.19), verts=4, m=m_gold,
             rot=(math.radians(90), 0, math.radians(sgn * 68)))
    sphere("ribbon_knot", 0.055, (0, -0.225, 1.19), (1, 1, 1), 8, 6, m_gold)

    # ---- 팔
    for sgn in (-1, 1):
        cone(f"arm_{sgn}", 0.095, 0.07, 0.52, (sgn * 0.32, 0, 1.02),
             verts=6, m=m_coat, rot=(0, math.radians(sgn * 13), 0))
        sphere(f"hand_{sgn}", 0.078, (sgn * 0.40, 0, 0.76), (1, 1, 0.9), 8, 6, m_skin)

    # ---- 다리 + 부츠
    for sgn in (-1, 1):
        cone(f"leg_{sgn}", 0.10, 0.085, 0.46, (sgn * 0.145, 0, 0.34),
             verts=6, m=m_stock)
        sphere(f"boot_{sgn}", 0.135, (sgn * 0.145, -0.035, 0.11),
               (1.0, 1.3, 0.75), 8, 6, m_boot)


def setup_render():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    print("[ENGINE]", scene.render.engine)
    scene.render.resolution_x = 192
    scene.render.resolution_y = 192
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filter_size = 0.6      # 픽셀 경계 또렷하게
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.60, 0.78, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.24

    # 3점 조명 — 면마다 밝기 차이를 만드는 핵심
    key = bpy.data.lights.new("key", "SUN")
    key.energy = 4.2
    key.color = (1.0, 0.97, 0.94)
    ko = bpy.data.objects.new("key", key)
    bpy.context.collection.objects.link(ko)
    ko.rotation_euler = Euler((math.radians(58), 0, math.radians(-38)))

    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy = 1.1
    fill.color = (0.82, 0.86, 1.0)
    fo = bpy.data.objects.new("fill", fill)
    bpy.context.collection.objects.link(fo)
    fo.rotation_euler = Euler((math.radians(74), 0, math.radians(126)))

    rim = bpy.data.lights.new("rim", "SUN")
    rim.energy = 2.0
    rim.color = (1.0, 0.86, 0.95)
    ro = bpy.data.objects.new("rim", rim)
    bpy.context.collection.objects.link(ro)
    ro.rotation_euler = Euler((math.radians(112), 0, math.radians(196)))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 3.05
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def render_turnaround(cam):
    target = Vector((0, 0, 1.22))
    dist, elev = 6.0, math.radians(9)
    paths = []
    for i, deg in enumerate((0, 45, 90, 180)):
        a = math.radians(deg)
        cam.location = Vector((math.sin(a) * dist * math.cos(elev),
                               -math.cos(a) * dist * math.cos(elev),
                               target.z + math.sin(elev) * dist))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        p = os.path.join(OUT, f"turn_{i}_{deg}.png")
        bpy.context.scene.render.filepath = p
        bpy.ops.render.render(write_still=True)
        paths.append(p)
    return paths


build()
cam = setup_render()
paths = render_turnaround(cam)

bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "timeto_v1.glb"),
                          export_format="GLB", export_apply=True)

for o in bpy.data.objects:
    if o.type == "MESH":
        o.data.calc_loop_triangles()
tris = sum(len(o.data.loop_triangles) for o in bpy.data.objects if o.type == "MESH")
verts = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH")
print(f"[STATS] parts={len([o for o in bpy.data.objects if o.type=='MESH'])} verts={verts} tris={tris}")
print("[DONE]", ", ".join(os.path.basename(p) for p in paths))
