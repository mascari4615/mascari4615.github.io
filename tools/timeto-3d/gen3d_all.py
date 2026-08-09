import base64, json, os, time, urllib.request, glob

API = "http://127.0.0.1:8081"
OUTDIR = r"C:\Users\masca\work\timeto-3d\ai"
os.makedirs(OUTDIR, exist_ok=True)

t0 = time.time()
while time.time() - t0 < 1200:
    try:
        urllib.request.urlopen(API + "/docs", timeout=3); break
    except Exception: time.sleep(8)
else:
    print("SERVER_TIMEOUT"); raise SystemExit(1)
print("SERVER_UP", int(time.time()-t0), "s", flush=True)

ok = []
for img in sorted(glob.glob(r"C:\Users\masca\work\timeto-gen\chibi2_*.png")):
    name = os.path.basename(img)[:-4]
    p = {"image": base64.b64encode(open(img,'rb').read()).decode(),
         "octree_resolution": 256, "num_inference_steps": 20, "guidance_scale": 5.0,
         "face_count": 8000, "texture": False, "seed": 1234, "type": "glb"}
    r = urllib.request.Request(API+"/generate", data=json.dumps(p).encode(),
                               headers={"Content-Type":"application/json"})
    t = time.time()
    try:
        d = urllib.request.urlopen(r, timeout=1200).read()
        out = os.path.join(OUTDIR, name + ".glb")
        open(out,"wb").write(d); ok.append(out)
        print("OK", name, len(d), int(time.time()-t), "s", flush=True)
    except Exception as e:
        print("FAIL", name, e, flush=True)
print("DONE_ALL", len(ok), "succeeded", flush=True)
