# -*- coding: utf-8 -*-
"""
배지(라이트박스 자석) **껍데기 규격**을 정하는 정지 컷 (TASK-KL-345).

이건 방이 아니다. **어떤 그래픽을 넣어도 「불 켜진 미니 간판」으로 보이게 하는 껍데기**를
확정하기 위한 클로즈업 한 장이다. 안에 든 그림(편의점 로고든 도구 아이콘이든 글자든)은
바뀌는 것이고, 여기서 정하는 것은 **두께·베젤·모서리·확산판이 튀어나온 정도·옆면 색**이다.

왜 정지 컷인가: 살아 있는 3D 씬을 조금씩 고치면 느낌이 한 번도 확정되지 않는다
(2026-08-21, 그 방식으로 여러 차례 빗나갔다). 한 장을 놓고 「이 느낌 맞아?」를 먼저 닫는다.

    blender --background --python tools/room-bake/badge.py -- --out tmp --samples 96 --gpu
    ... --depth 0.45 --bezel 0.055 --proud 0.12 --round 0.10

내보내는 것: <out>/badge-look.png
"""
import bpy
import sys
import os
import math
import argparse


def argv():
    a = argparse.ArgumentParser()
    a.add_argument('--out', default='tmp')
    a.add_argument('--samples', type=int, default=96)
    a.add_argument('--gpu', action='store_true')
    # 껍데기 규격 — 전부 **높이 대비 비율**이다 (크기가 달라도 같은 물건으로 보이게)
    a.add_argument('--depth', type=float, default=0.45)   # 두께 / 높이
    a.add_argument('--bezel', type=float, default=0.055)  # 틀 두께 / 높이
    a.add_argument('--proud', type=float, default=0.12)   # 확산판이 틀보다 튀어나온 정도 / 두께
    a.add_argument('--round', type=float, default=0.10)   # 모서리 둥글기 / 높이
    tail = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return a.parse_args(tail)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb, rough=0.5, metal=0.0, emit=None, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (emit[0], emit[1], emit[2], 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


def rounded_box(name, w, h, d, r, material):
    """모서리가 둥근 상자. 각진 상자는 3D 에서 곧바로 「프로그래머가 만든 것」으로 읽힌다."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    bev = o.modifiers.new('bevel', 'BEVEL')
    bev.width = r
    bev.segments = 4
    bev.limit_method = 'ANGLE'
    # 블렌더 4.1+ 는 use_auto_smooth 가 없다 — 각도 기준 스무딩은 모디파이어로 준다
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
    o.data.materials.append(material)
    return o


def badge(name, x, w, h, spec, panel_mat, frame_rgb):
    """배지 한 장 = 틀(상자) + 그 안에서 **살짝 튀어나온** 확산판.

    ★ 튀어나오는 것이 핵심이다. 확산판이 틀과 같은 높이면 스티커로 보이고,
      0.5mm 만 나와도 「박혀 있는 아크릴」이 된다 — 실물 사진의 그 느낌이 이것이다."""
    d = h * spec.depth
    r = h * spec.round
    b = h * spec.bezel
    frame = rounded_box(name + '-frame', w, h, d, min(r, d * 0.45),
                        mat(name + '-fm', frame_rgb, rough=0.42))
    frame.location = (x, 0, h / 2)

    pw, ph = w - b * 2, h - b * 2
    pd = d * spec.proud * 2
    panel = rounded_box(name + '-panel', pw, ph, pd, min(r * 0.6, pd * 0.45), panel_mat)
    panel.location = (x, -d / 2 - pd / 2 + 0.0006, h / 2)
    return frame, panel


def panel_mat_solid(name, rgb, lit=True):
    """확산판 — 유백 아크릴 **뒤에서** 빛이 나온다.

    ★ 안쪽 밝기가 고르면 「색칠한 플라스틱」으로 보인다. 실물은 LED 가 박힌 자리가
      더 밝고 가장자리로 갈수록 어둡다. 그 불균일이 「켜져 있다」의 정체다.
      그래서 구면 그라디언트로 가운데를 띄우고, 배지 안에는 진짜 면광을 하나 넣는다."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1)
    b.inputs['Roughness'].default_value = 0.28
    if not lit:
        return m

    coord = nt.nodes.new('ShaderNodeTexCoord')
    mapn = nt.nodes.new('ShaderNodeMapping')
    mapn.inputs['Scale'].default_value = (1.0, 1.0, 1.0)
    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'SPHERICAL'
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.20
    ramp.color_ramp.elements[0].color = (0.45, 0.45, 0.45, 1)
    ramp.color_ramp.elements[1].position = 0.95
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1)
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = 9.0   # 판이 곧 광원이다 — 약하면 둘레에 빛이 안 번진다

    nt.links.new(coord.outputs['Object'], mapn.inputs['Vector'])
    nt.links.new(mapn.outputs['Vector'], grad.inputs['Vector'])
    nt.links.new(grad.outputs['Color'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], mul.inputs[0])
    nt.links.new(mul.outputs['Value'], b.inputs['Emission Strength'])
    b.inputs['Emission Color'].default_value = (rgb[0], rgb[1], rgb[2], 1)
    return m


def inner_lamp(name, x, w, h, spec, rgb):
    """배지 **안**에 넣는 면광. 이게 있어야 판 둘레와 옆면에 색이 번지고,
       판에도 색 그림자가 진다 — 「진짜 켜진 물건」의 마지막 조각이다."""
    d = h * spec.depth
    bpy.ops.object.light_add(type='AREA', location=(x, -d * 0.18, h / 2))
    L = bpy.context.object
    L.name = name
    L.data.shape = 'RECTANGLE'
    L.data.size = w * 0.8
    L.data.size_y = h * 0.7
    L.data.energy = max(0.35, w * h * 260)
    L.data.color = (min(1, rgb[0] + 0.25), min(1, rgb[1] + 0.25), min(1, rgb[2] + 0.25))
    L.rotation_euler = (math.radians(-90), 0, 0)
    return L


def add_text(name, body, x, h, size, rgb, front):
    """글자는 확산판 **앞**에 세운다 — 판이 틀보다 튀어나와 있어서, 안쪽에 두면 묻힌다."""
    bpy.ops.object.text_add(location=(x, front - 0.0012, h / 2))
    t = bpy.context.object
    t.name = name
    t.data.body = body
    t.data.align_x = 'CENTER'
    t.data.align_y = 'CENTER'
    t.data.size = size
    t.data.extrude = 0.0006
    t.rotation_euler = (math.radians(90), 0, 0)
    t.data.materials.append(mat(name + '-m', rgb, rough=0.5))
    return t


def build(spec):
    H = 0.075                     # 배지 높이 7.5cm — 실물 자석 크기
    gap = H * 0.55
    made = []

    # 다섯 장, **안에 든 그림만 다르다**. 껍데기는 전부 같은 규격이다.
    # 다섯 장 — **껍데기 규격은 같고 안에 든 것과 틀 색만 다르다**.
    # 틀 색을 하나로 통일하면 세트가 아니라 「같은 파일 복사」로 보인다.
    plan = [
        ('a', H * 2.6, (0.01, 0.13, 0.62), (0.05, 0.05, 0.06), 'FAV'),
        ('b', H * 1.0, (0.62, 0.03, 0.03), (0.88, 0.88, 0.86), None),
        ('c', H * 1.8, (0.02, 0.30, 0.11), (0.05, 0.05, 0.06), 'TOOLS'),
        ('d', H * 1.0, (0.80, 0.36, 0.01), (0.42, 0.43, 0.46), None),
        ('e', H * 2.2, (0.86, 0.84, 0.78), (0.10, 0.10, 0.12), 'KARMO'),
    ]
    total = sum(p[1] for p in plan) + gap * (len(plan) - 1)
    x = -total / 2
    for key, w, rgb, frame_rgb, text in plan:
        cx = x + w / 2
        pm = panel_mat_solid('pm-' + key, rgb, lit=True)
        frame, panel = badge(key, cx, w, H, spec, pm, frame_rgb)
        front = panel.location[1] - (H * spec.depth * spec.proud)
        if text:
            # 글자는 확산판 **앞에** 얹는다 — 빛을 막아 실루엣이 진해진다(실물이 그렇다)
            add_text('t-' + key, text, cx, H, H * 0.32, (0.97, 0.96, 0.93), front)
        made.append(cx)
        x += w + gap
    return H


def pegboard(H):
    """타공판 — 배지가 붙어 있을 자리. 밝은 회색(레퍼런스는 불 켜진 방이다)."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0.02, H * 0.5))
    o = bpy.context.object
    o.name = 'peg'
    o.scale = (1.4, 0.7, 1)
    o.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(scale=True)
    m = bpy.data.materials.new('peg')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.115, 0.112, 0.107, 1)
    b.inputs['Roughness'].default_value = 0.85
    # 구멍 무늬 — 체커 두 겹으로 점을 만든다(이미지 파일 0)
    # 체커를 쓰면 「투명 배경」으로 읽힌다 (2026-08-21 실측). 판은 수수하게 두고
    # 주인공은 배지에 맡긴다 — 구멍 무늬는 방 씬에서 따로 얹는다.
    o.data.materials.append(m)
    return o


def lights(H):
    """불 켜진 방 — 레퍼런스 사진이 그렇다. 어두운 방은 배지의 아기자기함을 잡아먹는다."""
    bpy.ops.object.light_add(type='AREA', location=(-0.55, -0.75, 0.75))
    k = bpy.context.object
    k.data.energy = 26
    k.data.size = 0.9
    k.data.color = (1.0, 0.94, 0.88)
    k.rotation_euler = (math.radians(58), 0, math.radians(-35))

    bpy.ops.object.light_add(type='AREA', location=(0.85, -0.6, 0.35))
    f = bpy.context.object
    f.data.energy = 9
    f.data.size = 1.2
    f.data.color = (0.78, 0.86, 1.0)
    f.rotation_euler = (math.radians(80), 0, math.radians(60))

    w = bpy.data.worlds.new('w')
    bpy.context.scene.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.10, 0.11, 0.14, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.35


def camera(H):
    bpy.ops.object.camera_add(location=(0.02, -1.35, H * 1.05))
    c = bpy.context.object
    c.data.lens = 52                      # 접사 망원은 두 장밖에 안 들어왔다 — 조금 넓게
    c.rotation_euler = (math.radians(86), 0, math.radians(6))
    bpy.context.scene.camera = c
    c.data.dof.use_dof = True             # 초점 흐림 = 「사진」의 결정적 신호
    c.data.dof.focus_distance = 1.35
    c.data.dof.aperture_fstop = 4.5
    return c


def render(out, samples, use_gpu):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = 1400
    sc.render.resolution_y = 620
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [v.name for v in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    if use_gpu:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        try:
            prefs.compute_device_type = 'OPTIX'
        except Exception:
            prefs.compute_device_type = 'CUDA'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = 'GPU'
    os.makedirs(out, exist_ok=True)
    sc.render.filepath = os.path.join(out, 'badge-look.png')
    bpy.ops.render.render(write_still=True)
    print('[badge] 저장: %s' % sc.render.filepath)


def main():
    a = argv()
    reset()
    H = build(a)
    pegboard(H)
    lights(H)
    camera(H)
    render(os.path.abspath(a.out), a.samples, a.gpu)


main()
