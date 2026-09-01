import { resolve } from 'node:path';

/**
 * package.json 의 file: 의존. 논리 이름과 실제 경로 분리
 * scoped package 이름은 파일 경로가 아니므로 spec 만 경로 계산에 사용
 */
export function resolveLocalPackageDependencies(manifest, appRoot) {
  const entries = {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
  };

  return Object.entries(entries)
    .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('file:'))
    .map(([name, spec]) => ({
      name,
      spec,
      path: resolve(appRoot, spec.slice('file:'.length)),
    }));
}
