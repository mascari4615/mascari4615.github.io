"""텍스처 포함 3D 생성 — 서버(--enable_tex) 대기 → 그림 투입 → glb.

앞·뒤 검증은 render_ai.py 로 따로.
"""
import base64, json, os, sys, time, urllib.request, glob

API = "http://127.0.0.1:8081"
OUTDIR = r"C:\Users\masca\work\timeto-3d\ai_tex"
os.makedirs(OUTDIR, exist_ok=True)
PATTERN = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\masca\work\timeto-gen\chibi3_*.png"

t0 = time.time()
while time.time() - t0 < 2400:
    try:
        urllib.request.urlopen(API + "/docs", timeout=3); break
    except Exception: time.sleep(10)
else:
    print("SERVER_TIMEOUT"); raise SystemExit(1)
print("SERVER_UP", int(time.time() - t0), "s", flush=True)

files = sorted(glob.glob(PATTERN))
print("inputs:", len(files), flush=True)
for img in files:
    name = os.path.basename(img)[:-4]
    p = {"image": base64.b64encode(open(img, 'rb').read()).decode(),
         "octree_resolution": 320, "num_inference_steps": 20, "guidance_scale": 5.0,
         "texture": True, "face_count": 20000, "seed": 1234, "remove_background": True}
    r = urllib.request.Request(API + "/generate", data=json.dumps(p).encode(),
                               headers={"Content-Type": "application/json"})
    t = time.time()
    try:
        d = urllib.request.urlopen(r, timeout=3600).read()
        out = os.path.join(OUTDIR, name + "_tex.glb")
        open(out, "wb").write(d)
        print("OK", name, len(d), int(time.time() - t), "s", flush=True)
    except Exception as e:
        print("FAIL", name, e, flush=True)
print("DONE_ALL", flush=True)
