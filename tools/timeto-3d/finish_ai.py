"""AI 생성 glb → 웹용 마무리: 감축 + 정면 투영 UV + 원본 그림 텍스처 → viewer/timeto.glb

정면 투영이라 뒤통수는 늘어난다 — 1차 확인용. 제대로 된 텍스처는 Hunyuan 텍스처 파이프라인(별도 컴파일).
실행: blender -b -P finish_ai.py -- <glb> <image> <out.glb> [목표tri]
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
GLB = argv[0] if argv else r"C:\Users\masca\work\timeto-3d\ai\chibi2_7001.glb"
IMG = argv[1] if len(argv) > 1 else r"C:\Users\masca\work\timeto-gen\chibi2_7001.png"
OUT = argv[2] if len(argv) > 2 else r"C:\Users\masca\work\timeto-3d\viewer\timeto.glb"
TARGET = int(argv[3]) if len(argv) > 3 else 9000

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=GLB)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]

# 1) 정규화 — 높이 2.0, 바닥 0, 중앙 정렬
mn = Vector((1e9,) * 3)
mx = Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector((min(mn[i], w[i]) for i in range(3)))
        mx = Vector((max(mx[i], w[i]) for i in range(3)))
s = 2.0 / max((mx - mn).z, 1e-6)
M = Matrix.Translation((-(mn.x + mx.x) / 2 * s, -(mn.y + mx.y) / 2 * s, -mn.z * s)) @ Matrix.Scale(s, 4)
for o in bpy.data.objects:
    if o.parent is None:
        o.matrix_world = M @ o.matrix_world

# 2) 하나로 합치기
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

obj.data.calc_loop_triangles()
before = len(obj.data.loop_triangles)

# 3) 감축
dec = obj.modifiers.new("dec", "DECIMATE")
dec.ratio = min(1.0, TARGET / max(before, 1))
bpy.ops.object.modifier_apply(modifier="dec")
obj.data.calc_loop_triangles()
after = len(obj.data.loop_triangles)

# 4) 정면 카메라 만들고 그 시점으로 UV 투영
cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 2.0
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam
cam.location = Vector((0, -6, 1.0))
cam.rotation_euler = (Vector((0, 0, 1.0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.render.resolution_x = scene.render.resolution_y = 1024

# 정면 직교 투영 UV — 모델 bbox ↔ 그림 속 캐릭터 bbox 를 직접 맞춘다
import numpy as np

src_img = bpy.data.images.load(IMG)
IW, IH = src_img.size
buf = np.empty(IW * IH * 4, dtype=np.float32)
src_img.pixels.foreach_get(buf)
alpha = buf.reshape(IH, IW, 4)[:, :, 3]
alpha = alpha[::-1]                      # blender 는 아래에서 위로 저장
mask = alpha > 0.06
if mask.sum() < 100:
    mask[:] = True
ys, xs = np.nonzero(mask)
ix0, ix1, iy0, iy1 = xs.min(), xs.max(), ys.min(), ys.max()
print(f"[UV] 그림 속 캐릭터 bbox x{ix0}-{ix1} y{iy0}-{iy1} / {IW}x{IH}")

# 모델은 이미 높이 2.0 정규화됨. bbox 다시 계산
co = [v.co for v in obj.data.vertices]
mx_x = max(c.x for c in co); mn_x = min(c.x for c in co)
mx_z = max(c.z for c in co); mn_z = min(c.z for c in co)
mw = max(mx_x - mn_x, 1e-6); mh = max(mx_z - mn_z, 1e-6)

uv = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
for poly in obj.data.polygons:
    for li in poly.loop_indices:
        c = obj.data.vertices[obj.data.loops[li].vertex_index].co
        fx = (c.x - mn_x) / mw          # 0..1 좌→우
        fz = (c.z - mn_z) / mh          # 0..1 아래→위
        px = ix0 + fx * (ix1 - ix0)
        py = iy1 - fz * (iy1 - iy0)     # 이미지 y 는 위가 0
        uv.data[li].uv = (px / IW, 1.0 - py / IH)

# 5) 원본 그림을 텍스처로
mat = bpy.data.materials.new("timeto_ai")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(IMG)
tex.extension = "EXTEND"
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 1.0
obj.data.materials.clear()
obj.data.materials.append(mat)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True,
                          export_image_format="AUTO")
print(f"[FINISH] {os.path.basename(GLB)} tris {before} -> {after}, saved {OUT}")
