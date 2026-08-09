"""치비 티메토 — 이미지→3D 입력용.

목표: 2등신, 정면, 팔 벌린 A포즈, 배경 순백, 그림자 0.
이미지→3D 모델은 「보이는 면」만 복원하므로 실루엣이 또렷할수록 좋다.
"""
import gc
import sys

import torch
from diffusers import StableDiffusionXLPipeline, EulerAncestralDiscreteScheduler

MODEL = "cagliostrolab/animagine-xl-4.0"

CHAR = ("1girl, solo, chibi, 2 heads tall, big head, tiny body, lavender hair, "
        "side buns, ahoge, purple eyes, white lab coat, navy shirt, yellow ribbon, boots, ")

POSE = ("full body, standing, facing viewer, front view, arms apart, legs apart, "
        "symmetrical, gentle smile, ")

# 평면 셀화는 이미지→3D 가 부피를 못 읽는다 (실측: flat 6/6 실패, 음영 있는 것 2/2 성공)
STYLE = ("soft shading, simple lighting, masterpiece, best quality, absurdres, "
         "plain light gray background")

# 받침대·소품이 메시에 그대로 붙는다 (실측: 7001 에 원형 받침 생성됨)
NEG = ("lowres, bad anatomy, text, cropped, worst quality, signature, watermark, blurry, "
       "sticker, border, multiple views, flat color, lineart only, long legs, tall body, "
       "adult proportions, figure stand, pedestal, base, display stand, plant, furniture, "
       "props, floor, scenery")


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    seed0 = int(sys.argv[2]) if len(sys.argv) > 2 else 4000

    pipe = StableDiffusionXLPipeline.from_pretrained(
        MODEL, torch_dtype=torch.float16, use_safetensors=True, add_watermarker=False)
    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
    pipe.enable_model_cpu_offload()
    pipe.enable_vae_slicing()

    prompt = CHAR + POSE + STYLE
    for i in range(n):
        seed = seed0 + i
        g = torch.Generator("cuda").manual_seed(seed)
        img = pipe(prompt=prompt, negative_prompt=NEG,
                   width=896, height=1152,
                   num_inference_steps=30, guidance_scale=6.5,
                   generator=g).images[0]
        out = f"C:/Users/masca/work/timeto-gen/chibi3_{seed}.png"
        img.save(out)
        print("SAVED", out, flush=True)
        gc.collect()
        torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
