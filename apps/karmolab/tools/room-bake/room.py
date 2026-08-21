# -*- coding: utf-8 -*-
"""
방을 짓고 **빛을 구워** 내보낸다 (TASK-KL-345).

왜 굽나: 실시간 조명은 기계마다 다르게 보인다. 2026-08-21 실측 — 이 데스크톱의 브라우저가
`--use-angle=d3d11-warp-webgl`(소프트웨어)로 돌아 그림자·번짐이 통째로 꺼졌고, 켠 채로 두면
창이 아예 멎었다. 구워 두면 **어느 기계에서나 같은 그림**이고 실시간 빛은 0 이 된다.
기계 차이는 「해상도·프레임」만 먹고 그림은 안 갈린다.

돌리는 법 (사람 손 0):
    blender --background --python tools/room-bake/room.py -- --out room --size 1024 --samples 128 --gpu

내보내는 것:
    <out>/room.glb        구운 그림이 박힌 방 한 덩이 (three 에서 빛 없이 그린다)
    <out>/room-baked.png  구운 그림

단위는 **미터**. 웹 쪽 상수와 같은 값을 쓴다 — 두 벌로 적으면 갈라진다.
블렌더는 Z 가 위, 웹은 Y 가 위 — glTF 내보내기가 알아서 돌린다.
"""
import bpy
import sys
import os
import math
import argparse

# ── 치수 (웹과 한 벌) ─────────────────────────────────────────────
ROOM = dict(w=4.0, h=2.7, d=3.4)
DESK = dict(w=1.60, h=0.74, d=0.70, top=0.04)
PEG = dict(w=1.20, h=0.80, y=1.62, t=0.012)
WIN = dict(w=1.10, h=1.30, y=1.45, z=0.25)


def argv():
    a = argparse.ArgumentParser()
    a.add_argument('--out', default='room')
    a.add_argument('--size', type=int, default=2048)
    a.add_argument('--samples', type=int, default=128)
    a.add_argument('--gpu', action='store_true')
    tail = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return a.parse_args(tail)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1)
    bsdf.inputs['Roughness'].default_value = rough
    return m


def cube(name, size, loc, material):
    """size = 실제 한 변 길이(미터). primitive 는 한 변 1 로 만들고 scale 로 늘린 뒤 적용한다."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(material)
    return o


def plane(name, w, h, loc, rot, material):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = (w, h, 1)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(material)
    return o


def build():
    W, H, D = ROOM['w'], ROOM['h'], ROOM['d']

    m_wall = mat('wall', (0.55, 0.50, 0.44), 0.95)
    m_ceil = mat('ceil', (0.42, 0.37, 0.33), 1.0)
    m_floor = mat('floor', (0.34, 0.20, 0.11), 0.75)
    m_wood = mat('wood', (0.36, 0.22, 0.13), 0.7)
    m_top = mat('top', (0.52, 0.33, 0.19), 0.55)
    m_peg = mat('peg', (0.44, 0.32, 0.22), 0.9)
    m_dark = mat('dark', (0.10, 0.09, 0.08), 0.5)
    m_rug = mat('rug', (0.26, 0.20, 0.24), 0.96)
    m_plant = mat('plant', (0.16, 0.32, 0.14), 0.9)
    m_pot = mat('pot', (0.45, 0.26, 0.16), 0.9)
    m_mug = mat('mug', (0.78, 0.74, 0.68), 0.6)
    m_paper = mat('paper', (0.72, 0.66, 0.55), 0.9)
    m_shade = mat('shade', (0.72, 0.55, 0.30), 0.6)

    parts = []
    # 방 — 안쪽을 보는 면 다섯
    parts.append(plane('floor', W, D, (0, 0, 0), (0, 0, 0), m_floor))
    parts.append(plane('ceil', W, D, (0, 0, H), (math.pi, 0, 0), m_ceil))
    # 면은 **방 안쪽을 봐야 한다**. 뒤집히면 ① 웹에서 뒷면이 잘려 벽이 통째로 안 보이고
    # ② 굽는 단계에서도 빛을 등 뒤에서 받는다 (2026-08-21 실측: 벽이 사라졌다).
    parts.append(plane('back', W, H, (0, -D / 2, H / 2), (-math.pi / 2, 0, 0), m_wall))
    parts.append(plane('left', D, H, (-W / 2, 0, H / 2), (math.pi / 2, 0, math.pi / 2), m_wall))
    parts.append(plane('right', D, H, (W / 2, 0, H / 2), (math.pi / 2, 0, -math.pi / 2), m_wall))

    parts.append(cube('skirt', (W, 0.02, 0.09), (0, -D / 2 + 0.01, 0.045), m_wood))

    dz = -D / 2 + DESK['d'] / 2 + 0.02
    parts.append(cube('desk-top', (DESK['w'], DESK['d'], DESK['top']), (0, dz, DESK['h']), m_top))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(cube('leg%d%d' % (sx, sy), (0.05, 0.05, DESK['h']),
                              (sx * (DESK['w'] / 2 - 0.06), dz + sy * (DESK['d'] / 2 - 0.06),
                               DESK['h'] / 2), m_wood))

    # 타공판 — 구멍 무늬는 웹에서 얹는다. 여기서는 판(과 그 그림자)만.
    parts.append(cube('peg', (PEG['w'], PEG['t'], PEG['h']),
                      (0, -D / 2 + PEG['t'] / 2, PEG['y']), m_peg))

    parts.append(plane('rug', 1.9, 1.35, (0, dz + 1.0, 0.002), (0, 0, 0), m_rug))

    dy = DESK['h'] + DESK['top'] / 2
    parts.append(cube('mon-base', (0.24, 0.16, 0.02), (-0.18, dz - 0.16, dy + 0.01), m_dark))
    parts.append(cube('mon-arm', (0.03, 0.03, 0.22), (-0.18, dz - 0.16, dy + 0.14), m_dark))
    parts.append(cube('mon', (0.54, 0.02, 0.33), (-0.18, dz - 0.16, dy + 0.32), m_dark))
    parts.append(cube('kbd', (0.36, 0.13, 0.018), (-0.18, dz + 0.12, dy + 0.01), m_dark))

    for i, (t, h) in enumerate(((0.032, 0.22), (0.026, 0.20), (0.030, 0.24))):
        parts.append(cube('book%d' % i, (t, 0.16, h),
                          (-0.66 + i * 0.036, dz - 0.12, dy + h / 2), m_paper))

    bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=0.095, vertices=20,
                                        location=(0.16, dz + 0.16, dy + 0.048))
    o = bpy.context.object
    o.name = 'mug'
    o.data.materials.append(m_mug)
    parts.append(o)

    bpy.ops.mesh.primitive_cone_add(radius1=0.042, radius2=0.055, depth=0.10, vertices=18,
                                    location=(0.66, dz - 0.14, dy + 0.05))
    o = bpy.context.object
    o.name = 'pot'
    o.data.materials.append(m_pot)
    parts.append(o)
    for i in range(7):
        bpy.ops.mesh.primitive_cone_add(
            radius1=0.022, radius2=0.0, depth=0.16, vertices=6,
            location=(0.66 + math.cos(i * 1.9) * 0.03, dz - 0.14 + math.sin(i * 1.9) * 0.03,
                      dy + 0.17),
            rotation=(math.cos(i) * 0.5, math.sin(i) * 0.5, i))
        o = bpy.context.object
        o.name = 'leaf%d' % i
        o.data.materials.append(m_plant)
        parts.append(o)

    # 스탠드 — 갓은 **기둥 끝에 붙어야** 한다. 자리를 손으로 적으면 기울기를 바꿀 때마다
    # 갓이 허공에 뜬다 (2026-08-21 제보: 「전등이랑 기둥이 떨어져 있다」). 끝점을 계산한다.
    lamp_x, lamp_y = 0.52, dz - 0.10
    tilt, arm_len = 0.22, 0.42
    parts.append(cube('lamp-base', (0.14, 0.12, 0.014), (lamp_x, lamp_y, dy + 0.007), m_dark))
    arm_c = (lamp_x, lamp_y, dy + arm_len / 2)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=arm_len, vertices=10,
                                        location=arm_c, rotation=(0, tilt, 0))
    o = bpy.context.object
    o.name = 'lamp-arm'
    o.data.materials.append(m_dark)
    parts.append(o)
    tip = (arm_c[0] + math.sin(tilt) * arm_len / 2, arm_c[1],
           arm_c[2] + math.cos(tilt) * arm_len / 2)
    bpy.ops.mesh.primitive_cone_add(radius1=0.085, radius2=0.022, depth=0.12, vertices=22,
                                    location=(tip[0] - 0.03, tip[1], tip[2] - 0.02),
                                    rotation=(0, math.pi * 0.88, 0))
    o = bpy.context.object
    o.name = 'lamp-shade'
    o.data.materials.append(m_shade)
    parts.append(o)

    # ── 창 (왼쪽 벽) ────────────────────────────────────────────────
    # **왜 왼쪽인가**: 블렌더 Z-up → glTF Y-up 으로 깊이가 뒤집히고, 웹에서 반 바퀴 돌려 맞춘다.
    # 그래서 블렌더의 왼쪽이 화면의 오른쪽이 된다. 창은 화면 오른쪽에 있어야 한다.
    wx = -W / 2
    m_glass = mat('glass', (0.05, 0.08, 0.14), 0.2)
    glass = plane('window-glass', WIN['h'], WIN['w'], (wx + 0.02, WIN['z'], WIN['y']),
                  (math.pi / 2, 0, -math.pi / 2), m_glass)
    parts.append(glass)
    for dz_, dy_, sz in ((0, WIN['w'] / 2 + 0.03, (0.03, 0.06, WIN['h'] + 0.12)),
                         (0, -WIN['w'] / 2 - 0.03, (0.03, 0.06, WIN['h'] + 0.12)),
                         (WIN['h'] / 2 + 0.03, 0, (0.03, WIN['w'] + 0.12, 0.06)),
                         (-WIN['h'] / 2 - 0.03, 0, (0.03, WIN['w'] + 0.12, 0.06))):
        parts.append(cube('win-frame', sz, (wx + 0.03, WIN['z'] + dy_, WIN['y'] + dz_), m_wood))
    parts.append(cube('win-bar', (0.03, WIN['w'], 0.035), (wx + 0.03, WIN['z'], WIN['y']), m_wood))

    # 커튼 두 짝 — 주름을 얇은 판 여럿으로 흉내낸다 (천 시뮬은 굽는 값에 비해 안 남는다)
    m_curtain = mat('curtain', (0.42, 0.34, 0.30), 0.95)
    for side in (-1, 1):
        for k in range(5):
            parts.append(cube('curtain%d%d' % (side, k), (0.02, 0.055, WIN['h'] + 0.22),
                              (wx + 0.10 + (k % 2) * 0.015,
                               WIN['z'] + side * (WIN['w'] / 2 + 0.04 + k * 0.05),
                               WIN['y'] + 0.05), m_curtain))

    # 포스터 — 뒷벽 빈자리
    m_poster = mat('poster', (0.62, 0.30, 0.26), 0.9)
    parts.append(cube('poster', (0.42, 0.008, 0.58), (-1.25, -D / 2 + 0.006, 1.55), m_poster))
    parts.append(cube('poster-2', (0.34, 0.008, 0.24), (1.32, -D / 2 + 0.006, 1.30),
                      mat('poster2', (0.30, 0.38, 0.48), 0.9)))

    # 고양이 — 카펫 위에서 자고 있다
    m_cat = mat('cat', (0.30, 0.27, 0.25), 0.9)
    cat_x, cat_y = 0.62, dz + 1.15
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.13, segments=18, ring_count=10,
                                         location=(cat_x, cat_y, 0.09))
    o = bpy.context.object
    o.name = 'cat-body'
    o.scale = (1.5, 1.0, 0.62)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(m_cat)
    parts.append(o)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.075, segments=16, ring_count=9,
                                         location=(cat_x - 0.17, cat_y - 0.02, 0.10))
    o = bpy.context.object
    o.name = 'cat-head'
    o.data.materials.append(m_cat)
    parts.append(o)
    for ear in (-1, 1):
        bpy.ops.mesh.primitive_cone_add(radius1=0.028, radius2=0, depth=0.05, vertices=8,
                                        location=(cat_x - 0.18, cat_y - 0.02 + ear * 0.045, 0.155))
        o = bpy.context.object
        o.name = 'cat-ear'
        o.data.materials.append(m_cat)
        parts.append(o)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=0.24, vertices=10,
                                        location=(cat_x + 0.20, cat_y + 0.06, 0.045),
                                        rotation=(0, math.radians(90), math.radians(28)))
    o = bpy.context.object
    o.name = 'cat-tail'
    o.data.materials.append(m_cat)
    parts.append(o)

    return parts


def lights():
    """빛 둘 — 스탠드(따뜻함)와 창(차가움). 하나면 방이 한 색이 된다(앞 판의 실패)."""
    dz = -ROOM['d'] / 2 + DESK['d'] / 2 + 0.02
    dy = DESK['h'] + DESK['top'] / 2

    bpy.ops.object.light_add(type='AREA', location=(0.50, dz - 0.10, dy + 0.40))
    lamp = bpy.context.object
    lamp.name = 'lamp'
    lamp.data.energy = 22
    lamp.data.size = 0.14
    lamp.data.color = (1.0, 0.72, 0.45)
    lamp.rotation_euler = (math.radians(35), 0, math.radians(-20))

    bpy.ops.object.light_add(type='AREA', location=(-ROOM['w'] / 2 - 0.06, WIN['z'], WIN['y']))
    win = bpy.context.object
    win.name = 'window'
    win.data.shape = 'RECTANGLE'
    win.data.size = WIN['h']
    win.data.size_y = WIN['w']
    win.data.energy = 46
    win.data.color = (0.55, 0.72, 1.0)
    win.rotation_euler = (0, math.radians(90), 0)

    world = bpy.data.worlds.new('w')
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.09, 0.10, 0.13, 1)
    bg.inputs[1].default_value = 0.35


def join(parts):
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    room = bpy.context.object
    room.name = 'Room'
    return room


def unwrap(room):
    """구운 그림을 담을 UV. 겹치면 한 자리에 두 그림이 구워진다 — smart project 로 펼친다."""
    bpy.context.view_layer.objects.active = room
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.006)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake(room, size, samples, use_gpu):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    if use_gpu:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        try:
            prefs.compute_device_type = 'OPTIX'
        except Exception:
            prefs.compute_device_type = 'CUDA'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = 'GPU'

    img = bpy.data.images.new('baked', size, size, alpha=False)
    # 굽는 곳 = 각 재질의 **활성 이미지 노드**. 하나라도 빠지면 그 면만 까맣게 구워진다.
    for slot in room.material_slots:
        nt = slot.material.node_tree
        node = nt.nodes.new('ShaderNodeTexImage')
        node.image = img
        node.name = 'BAKE'
        for n in nt.nodes:
            n.select = False
        node.select = True
        nt.nodes.active = node

    bpy.ops.object.select_all(action='DESELECT')
    room.select_set(True)
    bpy.context.view_layer.objects.active = room
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.margin = 8
    bpy.ops.object.bake(type='COMBINED')
    return img


def finish(room, img, out, size):
    os.makedirs(out, exist_ok=True)
    png = os.path.join(out, 'room-baked.png')
    img.filepath_raw = png
    img.file_format = 'PNG'
    img.save()

    # 내보낼 재질 한 장 — 구운 그림만 물린다 (웹에서 빛 없이 그린다)
    m = bpy.data.materials.new('Baked')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    tex = m.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 1.0
    room.data.materials.clear()
    room.data.materials.append(m)

    bpy.ops.object.select_all(action='DESELECT')
    room.select_set(True)
    bpy.context.view_layer.objects.active = room

    glb = os.path.join(out, 'room.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB',
                              use_selection=True, export_apply=True)
    print('[room-bake] 저장: %s · %s (%dpx)' % (glb, png, size))


def main():
    a = argv()
    out = os.path.abspath(a.out)
    reset()
    parts = build()
    lights()
    room = join(parts)
    unwrap(room)
    img = bake(room, a.size, a.samples, a.gpu)
    finish(room, img, out, a.size)


main()
