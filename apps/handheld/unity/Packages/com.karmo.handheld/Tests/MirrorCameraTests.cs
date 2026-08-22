using NUnit.Framework;
using UnityEngine;

namespace Handheld.Tests
{
    /// <summary>
    /// 「이미 돌고 있는 앱의 카메라에 붙여도 화면이 안 사라진다」 — 이것 하나가 전부다.
    /// 조용히 깨지는 종류라(화면이 검어질 뿐 예외가 안 난다) 시험으로 못을 박는다.
    /// </summary>
    public class MirrorCameraTests
    {
        static (GameObject, HandheldRig, Camera) MakeRig(bool keepScreen)
        {
            var go = new GameObject("rig-test");
            var cam = go.AddComponent<Camera>();
            cam.targetTexture = null;
            var rig = go.AddComponent<HandheldRig>();
            rig.keepScreenOutput = keepScreen;
            rig.PrepareViewfinder();
            return (go, rig, cam);
        }

        [Test]
        public void 화면_유지를_켜면_원본_카메라를_안_뺏는다()
        {
            var (go, rig, cam) = MakeRig(true);
            try
            {
                Assert.IsNull(cam.targetTexture, "원본 카메라가 RenderTexture 로 끌려갔다 — 화면이 사라진다");
                Assert.IsNotNull(rig.ViewfinderTexture, "뷰파인더 RT 가 안 만들어졌다");
                Assert.IsNotNull(rig.MirrorCamera, "사본 카메라가 없다");
                Assert.AreSame(rig.ViewfinderTexture, rig.MirrorCamera.targetTexture,
                    "사본이 뷰파인더 RT 를 안 그린다");
                Assert.IsFalse(rig.MirrorCamera.enabled,
                    "사본이 켜져 있으면 엔진이 한 번 더 그린다 — 우리가 부를 때만 그려야 한다");
            }
            finally { Object.DestroyImmediate(go); }
        }

        [Test]
        public void 화면_유지를_끄면_원본_카메라가_뷰파인더를_그린다()
        {
            var (go, rig, cam) = MakeRig(false);
            try
            {
                Assert.IsNull(rig.MirrorCamera, "사본이 필요 없는데 만들어졌다");
                Assert.AreSame(rig.ViewfinderTexture, cam.targetTexture);
            }
            finally { Object.DestroyImmediate(go); }
        }

        [Test]
        public void 사본은_씬에_저장되지_않는다()
        {
            var (go, rig, _) = MakeRig(true);
            try
            {
                var mirror = rig.MirrorCamera;
                Assert.IsNotNull(mirror);
                Assert.AreNotEqual(HideFlags.None, mirror.gameObject.hideFlags & HideFlags.DontSave,
                    "사본이 씬에 저장되면 다음에 열 때 유령 카메라가 남는다");
            }
            finally { Object.DestroyImmediate(go); }
        }

        [Test]
        public void 화면_유지를_껐다_켜면_사본이_따라온다()
        {
            var (go, rig, cam) = MakeRig(false);
            try
            {
                rig.keepScreenOutput = true;
                rig.streamHeight += 2;               // 크기를 바꿔 RT 를 다시 만들게 한다
                rig.PrepareViewfinder();
                Assert.IsNotNull(rig.MirrorCamera, "켰는데 사본이 안 생겼다");
                Assert.IsNull(cam.targetTexture, "켰는데 원본이 아직 끌려가 있다");

                rig.keepScreenOutput = false;
                rig.streamHeight += 2;
                rig.PrepareViewfinder();
                Assert.IsNull(rig.MirrorCamera, "껐는데 사본이 남았다");
                Assert.AreSame(rig.ViewfinderTexture, cam.targetTexture);
            }
            finally { Object.DestroyImmediate(go); }
        }
    }
}
