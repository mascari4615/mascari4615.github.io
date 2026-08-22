using UnityEngine;

namespace Handheld
{
    /// <summary>
    /// 다른 프로세스가 그린 화면을 **Spout2** 로 받아 폰 뷰파인더로 보낸다.
    /// 같은 PC 안에서만 된다 — GPU 텍스처를 공유하는 방식이라 CPU 부하가 사실상 0 이다.
    ///
    /// **대개 이게 필요 없다.** 그림 그리는 앱이 유니티면 이 패키지를 그 앱 안에 넣는 쪽이
    /// 낫다 (`Documentation~/embedding.md`). 이건 프로세스가 갈릴 때만 쓴다.
    ///
    /// 이 어셈블리는 KlakSpout 이 있을 때만 컴파일된다 — 없으면 통째로 빠지고 나머지는 돈다.
    /// </summary>
    [AddComponentMenu("Handheld/Spout Viewfinder Source")]
    [RequireComponent(typeof(Klak.Spout.SpoutReceiver))]
    public sealed class SpoutViewfinderSource : MonoBehaviour
    {
        [Tooltip("그림을 물릴 리그. 비우면 씬에서 찾는다.")]
        public HandheldRig rig;

        [Tooltip("받아 담을 크기. 보내는 쪽 해상도와 달라도 된다 (알아서 맞춰 담긴다).")]
        public int width = 1280;
        public int height = 720;

        RenderTexture _rt;

        void OnEnable()
        {
            if (rig == null) rig = FindAnyObjectByType<HandheldRig>();
            if (rig == null) { enabled = false; return; }

            _rt = new RenderTexture(Mathf.Max(2, width), Mathf.Max(2, height), 0)
            {
                name = "SpoutViewfinder",
                hideFlags = HideFlags.DontSave,
            };
            _rt.Create();

            GetComponent<Klak.Spout.SpoutReceiver>().targetTexture = _rt;
            rig.externalViewfinder = _rt;
        }

        void OnDisable()
        {
            var recv = GetComponent<Klak.Spout.SpoutReceiver>();
            if (recv != null) recv.targetTexture = null;
            if (rig != null && rig.externalViewfinder == _rt) rig.externalViewfinder = null;
            if (_rt == null) return;
            _rt.Release();
            if (Application.isPlaying) Destroy(_rt); else DestroyImmediate(_rt);
            _rt = null;
        }
    }
}
