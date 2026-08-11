# Garden 관찰 가이드

Garden은 결과를 맞히는 게임보다, 같은 규칙이 반복될 때 어떤 질서와 붕괴가 나타나는지 관찰하는 실험실이다. 각 탭의 `0.5× / 1× / 2× / 4×` 속도를 바꿔 한 장면을 오래 보거나 전이를 빠르게 훑을 수 있다. `pause`로 사건 직전의 상태를 멈추고 `reseed`로 같은 규칙의 다른 초기조건을 비교한다.

## 무엇을 볼까

| 모드 | 관찰 포인트 | 이 구현의 단순화 |
| --- | --- | --- |
| Reaction Diffusion | 얼룩·산호·파동이 feed/kill 값에 따라 생기고 안정되는가 | Gray-Scott 두 물질, 고정 격자와 주기 경계 |
| Particle Life | 종 사이 힘이 군집·고리·분리를 만드는가 | 속도/반경이 제한된 입자와 주기 공간 |
| Physarum | 먹이 사이 연결망과 손상 뒤 회복 경로 | 센서-증발 trail 모델, 실제 생물의 생리 모사는 아님 |
| Cyclic Ecosystem | 다섯 종이 순환 우위와 경계를 유지하는가 | 한 칸 이웃의 먹이사슬, 돌연변이·공간 비용 없음 |
| Sand Terrarium | 모래 낙하, 물의 흐름, 식물 성장과 불이 서로 바꾸는가 | 물리 엔진이 아닌 물질별 국소 cellular automaton |
| Boids | 정렬·응집·분리가 flock과 포식자 회피를 만드는가 | Reynolds식 세 힘과 제한된 포식자 |
| Lenia | 연속장 생명체의 질량·중심·분리·이동이 유지되는가 | 공식 동물 RLE와 polynomial kernel/growth를 작은 격자로 샘플링 |
| Neural CA | 손상 후 국소 업데이트만으로 목표 모양을 재생하는가 | 학습된 대형 모델 대신 고정된 소형 MLP |
| Evolution | 세대별 fitness·다양성·종 분화가 함께 움직이는가 | 작은 유전형과 먹이장, 실제 생태계의 적응을 주장하지 않음 |

## 출처와 더 읽을 것

- Reaction–diffusion: [Pearson, Complex Patterns in a Simple System (1993)](https://doi.org/10.1103/PhysRevLett.70.2723)
- Physarum: [Tero et al., Rules for biologically inspired adaptive network design (2010)](https://doi.org/10.1098/rsif.2009.0375)
- Boids: [Reynolds, Flocks, Herds, and Schools (1987)](https://www.red3d.com/cwr/boids/)
- Lenia: [Chan, Lenia – Biology of Artificial Life (2019)](https://arxiv.org/abs/1812.05433), [공식 catalogue/source](https://github.com/Chakazul/Lenia)
- Neural Cellular Automata: [Mordvintsev et al., Growing Neural Cellular Automata (2020)](https://distill.pub/2020/growing-ca/)
- Evolutionary computation: [Mitchell, An Introduction to Genetic Algorithms](https://mitpress.mit.edu/9780262631853/an-introduction-to-genetic-algorithms/)

이 구현은 위 연구의 아이디어를 관찰 가능한 작은 모델로 옮긴 것이다. 수치와 색상은 설명을 돕기 위한 것이며, 연구 결과나 생물학적 예측으로 해석하지 않는다.
