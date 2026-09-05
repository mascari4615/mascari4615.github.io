/**
 * 멍에 걸린 것 목록 (TASK-KL-247, 정원 병합)
 *
 * 한 줄에 서는 것 두 종류
 *   `piece` 그림. 시각의 함수로 한 장을 그린다 (`pieces.ts`)
 *   `sim`   관찰물. 자기 상태를 굴리며 사건을 문장으로 말한다 (`garden/sim-host.ts`)
 *
 * 늘리는 자리는 아래 배열 한 줄이다. 라벨은 `meong.piece.<id>`.
 */
import { droste } from './droste';
import type { Piece } from './pieces';
import type { SimBuilder } from './sims/sim-host';
import { buildLife } from './sims/life-view';
import { buildReactionDiffusion } from './sims/reaction-diffusion-view';
import { buildParticleLife } from './sims/particle-life-view';
import { buildPhysarum } from './sims/physarum-view';
import { buildCyclicEcosystem } from './sims/cyclic-ecosystem-view';
import { buildSandTerrarium } from './sims/sand-terrarium-view';
import { buildBoids } from './sims/boids-view';
import { buildLenia } from './sims/lenia-view';
import { buildNeuralCA } from './sims/neural-ca-view';
import { buildGeneticEvolution } from './sims/genetic-evolution-view';

export type Exhibit =
  | { id: string; kind: 'piece'; piece: Piece }
  | { id: string; kind: 'sim'; build: SimBuilder };

export const EXHIBITS: Exhibit[] = [
  { id: 'droste', kind: 'piece', piece: droste },
  { id: 'life', kind: 'sim', build: buildLife },
  { id: 'rd', kind: 'sim', build: buildReactionDiffusion },
  { id: 'pl', kind: 'sim', build: buildParticleLife },
  { id: 'ph', kind: 'sim', build: buildPhysarum },
  { id: 'ce', kind: 'sim', build: buildCyclicEcosystem },
  { id: 'st', kind: 'sim', build: buildSandTerrarium },
  { id: 'bd', kind: 'sim', build: buildBoids },
  { id: 'ln', kind: 'sim', build: buildLenia },
  { id: 'nc', kind: 'sim', build: buildNeuralCA },
  { id: 'ev', kind: 'sim', build: buildGeneticEvolution }
];

export function exhibitById(id: string): Exhibit {
  return EXHIBITS.find((e) => e.id === id) ?? EXHIBITS[0];
}
