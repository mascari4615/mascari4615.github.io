/**
 * 입체 판의 밑동. 판이 무엇이든 똑같이 하는 일만 모음
 *
 * 지금 입체 판은 여섯. 오목, 바둑 따먹기, 체커, 리버시가 `three-board.ts` 를,
 * 야추가 `dice-stage.ts` 를 씀. 두 파일이 아래를 각자 한 벌씩 들고 있었음
 * 세 번째 갈래(카드)를 만들면 세 벌
 *
 *  1. 캔버스 만들어 붙이기. 초점을 받게(자판 길)
 *  2. 그리개 만들기. 못 만들면 `null` (WebGL 없는 창)
 *  3. 어느 GPU 인가. WARP, SwiftShader, llvmpipe 면 CPU 로 그리는 중
 *  4. 색공간, 그림자, 톤 매핑
 *  5. 창 크기 따라가기. 화소 배율 상한 1.5 (판마다 같음)
 *  6. 치우기
 *
 * 판마다 다른 것은 여기 없음. 카메라, 빛, 물건, 조작은 부르는 쪽 몫
 */
import { ACESFilmicToneMapping, PCFShadowMap, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from '/packages/3d/vendor/three.module.min.js';

export interface StageCoreOpts {
  /** 그림자 결. 물건이 적으면 `soft`, 많으면 `hard` (오목은 알 200개라 hard) */
  shadow?: 'soft' | 'hard';
  /** 톤 매핑 노출. 0 이면 톤 매핑 안 검 */
  exposure?: number;
  /** 화소 배율 상한. 기본 1.5 */
  maxPixelRatio?: number;
}

export interface StageCore {
  canvas: HTMLCanvasElement;
  renderer: WebGLRenderer;
  /** CPU 로 그리는 중인가 */
  software: boolean;
  gpuName: string;
  /** 창 크기를 캔버스와 그리개에 반영. 화면비 반환(카메라는 부르는 쪽이 맞춤) */
  fit(): { w: number; h: number; aspect: number };
  dispose(): void;
}

/** 그리개까지 만들어 반환. WebGL 이 없으면 `null` (부르는 쪽이 못 쓴다고 답해야 함) */
export function mountStageCore(host: HTMLElement, opts: StageCoreOpts = {}): StageCore | null {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none';
  /* 초점을 받아야 자판으로 둘 수 있음. 마우스만 되는 판은 게이트가 막음 */
  canvas.tabIndex = 0;
  host.appendChild(canvas);

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    host.removeChild(canvas);
    return null;
  }

  /* GPU 이름. WARP(Basic Render Driver), SwiftShader, llvmpipe 면 CPU 로 그리는 중 */
  const gpuName = ((): string => {
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'gpu ?';
    } catch {
      return 'gpu ?';
    }
  })();
  const software = /Basic Render Driver|SwiftShader|llvmpipe|Software/i.test(gpuName);

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  /* PCFSoft 는 화소마다 표본이 몇 배. 물건이 많은 판에서 프레임 40~100ms 로 튐(실측) */
  renderer.shadowMap.type = opts.shadow === 'hard' ? PCFShadowMap : PCFSoftShadowMap;
  if (opts.exposure) {
    /* 톤 매핑이 없으면 밝은 데는 흰색으로 뭉개지고 어두운 데는 그냥 검정 */
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = opts.exposure;
  }

  const cap = opts.maxPixelRatio ?? 1.5;
  const fit = (): { w: number; h: number; aspect: number } => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setPixelRatio(Math.min(cap, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    return { w, h, aspect: w / h };
  };

  return {
    canvas,
    renderer,
    software,
    gpuName,
    fit,
    dispose(): void {
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  };
}
