using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Handheld.Urp
{
    /// <summary>
    /// 카메라의 **물리 렌즈 값**(focalLength·focusDistance·aperture)을 URP 의 피사계 심도로 옮긴다.
    /// TASK-KAR-230.
    ///
    /// 왜 따로 있나 — 리그(`HandheldRig`)는 「어떤 렌즈인가」만 말하고 흐림은 안 그린다. 흐림은
    /// 파이프라인 몫이라, 파이프라인을 아는 코드는 **이 어셈블리 하나**에 가둔다
    /// (`Handheld.Urp.asmdef` 는 URP 패키지가 있을 때만 컴파일된다 — 없으면 통째로 빠지고
    /// 나머지는 멀쩡히 돈다). URP 를 빼도 리그는 안 깨지고, HDRP 로 가면 이 파일의 형제를
    /// 하나 더 두면 된다.
    ///
    /// 리그가 편집 모드에서도 도는 물건이라 이것도 `[ExecuteAlways]` 다.
    /// </summary>
    [ExecuteAlways]
    [AddComponentMenu("Handheld/Handheld Depth Of Field (URP)")]
    public sealed class HandheldDepthOfField : MonoBehaviour
    {
        [Tooltip("렌즈 값을 읽어올 카메라. 비우면 이 오브젝트의 Camera.")]
        public Camera sourceCamera;

        [Tooltip("흐림을 그릴 볼륨. 비우면 씬에서 DepthOfField 를 가진 글로벌 볼륨을 찾는다.")]
        public Volume volume;

        [Tooltip("끄면 값만 안 밀어 넣는다 — 볼륨을 손으로 만질 때 쓴다.")]
        public bool driveFromCamera = true;

        [Tooltip("URP 보케는 초점거리를 1~300mm 로 자른다. 망원 끝에서 흐림이 더 안 세지는 건 이 한계다.")]
        public bool logClampOnce = true;

        DepthOfField _dof;
        Volume _boundTo;
        bool _warned;

        void OnEnable()
        {
            if (sourceCamera == null) sourceCamera = GetComponent<Camera>();
            Bind();
        }

        void Bind()
        {
            if (volume == null)
            {
                // 씬 안의 글로벌 볼륨 중 DepthOfField 를 가진 첫 놈.
                foreach (var v in FindObjectsByType<Volume>(FindObjectsSortMode.None))
                {
                    if (v.profile != null && v.profile.TryGet<DepthOfField>(out _)) { volume = v; break; }
                }
            }

            _dof = null;
            _boundTo = volume;
            if (volume != null && volume.profile != null) volume.profile.TryGet(out _dof);
        }

        void LateUpdate()
        {
            if (!driveFromCamera) return;
            if (sourceCamera == null) sourceCamera = GetComponent<Camera>();
            if (sourceCamera == null) return;

            if (_dof == null || _boundTo != volume) Bind();
            if (_dof == null)
            {
                if (!_warned)
                {
                    _warned = true;
                    Debug.LogWarning("[Handheld] 초점 흐림을 그릴 볼륨이 없다 — " +
                                     "메뉴 「Handheld/URP/씬에 초점 흐림 붙이기」를 눌러라.");
                }
                return;
            }
            _warned = false;

            if (!sourceCamera.usePhysicalProperties)
            {
                // 물리 카메라가 꺼져 있으면 mm·f-stop 이 뜻을 잃는다 — 흐림을 끄는 게 정직하다.
                _dof.active = false;
                return;
            }

            _dof.active = true;

            _dof.mode.overrideState = true;
            _dof.mode.value = DepthOfFieldMode.Bokeh;

            _dof.focusDistance.overrideState = true;
            _dof.focusDistance.value = Mathf.Max(0.1f, sourceCamera.focusDistance);

            // URP 보케의 손잡이 범위 — 밖으로 나가면 어차피 잘리므로 여기서 잘라 두고
            // 「지금 한계에 닿았다」를 한 번만 알린다.
            float mm = sourceCamera.focalLength;
            float mmClamped = Mathf.Clamp(mm, 1f, 300f);
            if (logClampOnce && mm > 300.5f)
            {
                logClampOnce = false;
                Debug.Log($"[Handheld] 초점거리 {mm:0}mm — URP 보케 상한 300mm 에 닿았다. " +
                          "여기서부터는 줌을 더 넣어도 흐림은 그대로다.");
            }
            _dof.focalLength.overrideState = true;
            _dof.focalLength.value = mmClamped;

            _dof.aperture.overrideState = true;
            _dof.aperture.value = Mathf.Clamp(sourceCamera.aperture, 1f, 32f);
        }
    }
}
