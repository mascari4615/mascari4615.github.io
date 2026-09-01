import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { resolveLocalPackageDependencies } from './local-package-dependencies.mjs';

test('scoped package 이름 대신 file spec 으로 실제 경로를 계산한다', () => {
  const appRoot = resolve('workspace/apps/karmolab');
  const dependencies = resolveLocalPackageDependencies({
    dependencies: {
      '@karmo/ai': 'file:../../packages/ai',
      badapple: 'file:../../packages/badapple',
      trystero: '^0.25.3',
    },
  }, appRoot);

  assert.deepEqual(dependencies, [
    {
      name: '@karmo/ai',
      spec: 'file:../../packages/ai',
      path: resolve('workspace/packages/ai'),
    },
    {
      name: 'badapple',
      spec: 'file:../../packages/badapple',
      path: resolve('workspace/packages/badapple'),
    },
  ]);
});

test('devDependency 의 file spec 도 같은 계약으로 찾는다', () => {
  const appRoot = resolve('workspace/apps/karmolab');
  const dependencies = resolveLocalPackageDependencies({
    devDependencies: {
      '@scope/tooling': 'file:../../packages/tooling',
    },
  }, appRoot);

  assert.equal(dependencies[0].name, '@scope/tooling');
  assert.equal(dependencies[0].path, resolve('workspace/packages/tooling'));
});
