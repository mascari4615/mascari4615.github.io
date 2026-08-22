using UnityEngine;

namespace Handheld
{
    /// <summary>
    /// 한 프레임의 카메라 상태 한 벌 — **호스트 앱에 넘기는 유일한 창구**.
    ///
    /// 우리 내부(리그·서버·보간)를 안 들여다봐도 이것만 받으면 카메라를 몰 수 있다.
    /// 받는 쪽 코드가 열 줄을 안 넘게 하려고 여기에 다 담는다.
    ///
    /// 자세를 **두 벌**로 준다:
    ///   <see cref="Rotation"/>      사원수 — 받는 쪽이 Slerp 하면 이쪽이 맞다
    ///   <see cref="EulerContinuous"/> 오일러(도) — 오일러로 들고 보간하는 쪽. **감기지 않는다**
    /// 오일러 쪽은 `Quaternion.Euler(pitch, yaw, roll)` 로 되돌리면 <see cref="Rotation"/> 과
    /// 같아진다 (시험으로 못을 박아 뒀다).
    ///
    /// 렌즈 값은 「그림을 어떻게 그릴지」다. 받는 쪽이 물리 카메라를 쓰면 초점거리·초점·조리개를
    /// 그대로 넣으면 되고, 아니면 <see cref="FovY"/> 만 써도 된다.
    /// </summary>
    public struct HandheldCameraFrame
    {
        public Vector3 Position;
        public Quaternion Rotation;

        /// <summary>피치·요·롤 (도). 감기지 않는다 — 359 다음이 361 이다.</summary>
        public Vector3 EulerContinuous;

        /// <summary>세로 화각 (도).</summary>
        public float FovY;

        /// <summary>배율 (1 = 기본 화각).</summary>
        public float Zoom;

        public float FocalLengthMm;
        public float FocusDistanceM;
        public float Aperture;
        public float SensorWidthMm;

        /// <summary>초점을 우리가 계속 잡고 있나 (수동 고정이 아닌가).</summary>
        public bool AutoFocus;

        /// <summary>폰이 붙어 있고 자세가 실제로 오고 있나.</summary>
        public bool Live;

        /// <summary>
        /// 받는 쪽이 흔히 자르는 범위에 들어와 있나. 벗어나면 그쪽에서 **조용히 잘려**
        /// 렌즈가 안 따라온다 — 화면만 이상하고 오류는 안 난다.
        /// 흔한 범위: 초점거리 1~300mm · 조리개 f/1~f/32 · 초점 0.1~100m · 화각 0~179°.
        /// </summary>
        public bool LensInCommonRange =>
            FovY > 0f && FovY < 179f &&
            (FocalLengthMm <= 0f || (FocalLengthMm >= 1f && FocalLengthMm <= 300f)) &&
            Aperture >= 1f && Aperture <= 32f &&
            FocusDistanceM >= 0.1f && FocusDistanceM <= 100f;

        /// <summary>범위를 벗어난 칸 이름 — 진단에 띄운다. 다 멀쩡하면 빈 문자열.</summary>
        public string LensOutOfRange()
        {
            string s = "";
            if (!(FovY > 0f && FovY < 179f)) s += "화각 ";
            if (FocalLengthMm > 0f && (FocalLengthMm < 1f || FocalLengthMm > 300f)) s += "초점거리 ";
            if (Aperture < 1f || Aperture > 32f) s += "조리개 ";
            if (FocusDistanceM < 0.1f || FocusDistanceM > 100f) s += "초점 ";
            return s.TrimEnd();
        }
    }
}
