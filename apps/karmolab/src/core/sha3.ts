/**
 * SHA-3 (FIPS-202) — 우리가 직접 (TASK-KL-205)
 *
 * 왜 직접 쓰나: 우리한테 있던 「SHA-3」은 CryptoJS 의 `SHA3` 였는데, 그건 **표준화 이전 Keccak**
 * 이라 값이 다르다. 진짜 SHA-3 을 주려면 ① 남의 라이브러리를 들이거나 ② 직접 쓰거나인데,
 * 남의 것을 `js/vendor/` 로 들이면 **브라우저에서만 돈다** — 그러면 Node 쪽엔 또 없어서
 * 「두 손이 달라 값이 갈리는」 문제가 그대로 남는다. 여기 두면 **한 벌을 양쪽이 같이 쓴다.**
 *
 * 「암호는 직접 짜지 마라」가 보통 맞지만 이건 예외다:
 *  - 비밀이 안 들어간다(열쇠 없음). 타이밍 공격 같은 게 성립하지 않는다.
 *  - 규격(FIPS-202)이 완전히 공개돼 있고 짧다.
 *  - **정답지가 있다** — Node 의 OpenSSL. 무작위 입력 수천 개를 기계로 대조한다
 *    (`scripts/test-core.mjs`). 눈으로 「맞겠지」 하는 자리가 없다.
 *
 * Keccak 과 SHA-3 의 차이는 딱 한 바이트다 — 메시지 끝에 붙이는 표시(domain separation).
 * Keccak 은 `0x01`, SHA-3 은 `0x06`. 그거 하나로 값 전체가 달라진다.
 * 그래서 두 개를 같은 코드로 내고 표시만 갈아 끼운다 — 우리 화면이 둘 다 보여 주므로.
 */

/** 64비트를 32비트 두 개로 나눠 다룬다. BigInt 는 느리고, 이 계산은 사람이 타이핑하는 속도로 돈다. */
const RC_HI = new Uint32Array([
  0x00000000, 0x00000000, 0x80000000, 0x80000000, 0x00000000, 0x00000000, 0x80000000, 0x80000000,
  0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x80000000, 0x80000000, 0x80000000,
  0x80000000, 0x80000000, 0x00000000, 0x80000000, 0x80000000, 0x80000000, 0x00000000, 0x80000000
]);
const RC_LO = new Uint32Array([
  0x00000001, 0x00008082, 0x0000808a, 0x80008000, 0x0000808b, 0x80000001, 0x80008081, 0x00008009,
  0x0000008a, 0x00000088, 0x80008009, 0x8000000a, 0x8000808b, 0x0000008b, 0x00008089, 0x00008003,
  0x00008002, 0x00000080, 0x0000800a, 0x8000000a, 0x80008081, 0x00008080, 0x80000001, 0x80008008
]);

/**
 * ρ 단계의 회전량. **자리 번호 = x + 5y** (y 가 바깥, 다섯 개씩 한 줄).
 * 이 표와 아래 π 의 자리 번호 규약이 **서로 같아야** 한다. 한쪽만 전치돼 있으면
 * 값이 통째로 달라지는데 결과는 여전히 그럴듯한 16진수라 눈으로는 못 잡는다
 * (실제로 그렇게 넣었다가 Node 대조에서 즉시 걸렸다 — 그래서 정답지를 먼저 놓고 짰다).
 */
const ROT = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14
];

/** π 단계: (x, y) → (y, 2x+3y). 자리 번호 규약이 위와 같아야 한다. */
const PI = new Uint8Array(25);
for (let x = 0; x < 5; x++) {
  for (let y = 0; y < 5; y++) {
    PI[x + 5 * y] = y + 5 * ((2 * x + 3 * y) % 5);
  }
}

/** 상태 1600비트 = 32비트 낱말 50개 (자리마다 [lo, hi]). */
function keccakF(sLo: Uint32Array, sHi: Uint32Array): void {
  const cLo = new Uint32Array(5);
  const cHi = new Uint32Array(5);
  const tLo = new Uint32Array(25);
  const tHi = new Uint32Array(25);

  for (let round = 0; round < 24; round++) {
    // θ — 열끼리 XOR 한 뒤 이웃 열을 한 칸 굴려 되먹인다.
    for (let x = 0; x < 5; x++) {
      cLo[x] = sLo[x] ^ sLo[x + 5] ^ sLo[x + 10] ^ sLo[x + 15] ^ sLo[x + 20];
      cHi[x] = sHi[x] ^ sHi[x + 5] ^ sHi[x + 10] ^ sHi[x + 15] ^ sHi[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      const nx = (x + 1) % 5;
      const px = (x + 4) % 5;
      const dLo = cLo[px] ^ ((cLo[nx] << 1) | (cHi[nx] >>> 31));
      const dHi = cHi[px] ^ ((cHi[nx] << 1) | (cLo[nx] >>> 31));
      for (let y = 0; y < 25; y += 5) {
        sLo[x + y] ^= dLo;
        sHi[x + y] ^= dHi;
      }
    }

    // ρ + π — 각 자리를 정해진 만큼 굴리고 자리를 바꾼다.
    for (let i = 0; i < 25; i++) {
      const r = ROT[i];
      const lo = sLo[i];
      const hi = sHi[i];
      let rLo: number;
      let rHi: number;
      if (r === 0) {
        rLo = lo;
        rHi = hi;
      } else if (r < 32) {
        rLo = (lo << r) | (hi >>> (32 - r));
        rHi = (hi << r) | (lo >>> (32 - r));
      } else if (r === 32) {
        rLo = hi;
        rHi = lo;
      } else {
        const k = r - 32;
        rLo = (hi << k) | (lo >>> (32 - k));
        rHi = (lo << k) | (hi >>> (32 - k));
      }
      tLo[PI[i]] = rLo;
      tHi[PI[i]] = rHi;
    }

    // χ — 같은 줄의 다음 둘을 보고 자기를 고친다. 여기만 비선형이다.
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) {
        sLo[y + x] = tLo[y + x] ^ (~tLo[y + ((x + 1) % 5)] & tLo[y + ((x + 2) % 5)]);
        sHi[y + x] = tHi[y + x] ^ (~tHi[y + ((x + 1) % 5)] & tHi[y + ((x + 2) % 5)]);
      }
    }

    // ι — 회차마다 다른 상수를 첫 자리에 섞는다. 이게 없으면 모든 회차가 똑같아진다.
    sLo[0] ^= RC_LO[round];
    sHi[0] ^= RC_HI[round];
  }
}

const HEX = '0123456789abcdef';

/**
 * @param bytes 입력
 * @param outBits 128 · 224 · 256 · 384 · 512 중 하나 (내보낼 비트 수)
 * @param pad `0x06` = SHA-3 표준 · `0x01` = 옛 Keccak. **이 한 바이트가 둘을 가른다.**
 */
export function keccakHex(bytes: Uint8Array, outBits: number, pad: number): string {
  const rate = 200 - outBits / 4; // 흡수 구간 크기(바이트). 512비트면 72바이트.
  const sLo = new Uint32Array(25);
  const sHi = new Uint32Array(25);
  const block = new Uint8Array(rate);

  let offset = 0;
  const absorb = (): void => {
    for (let i = 0; i < rate; i += 8) {
      const w = i >>> 3;
      sLo[w] ^= block[i] | (block[i + 1] << 8) | (block[i + 2] << 16) | (block[i + 3] << 24);
      sHi[w] ^= block[i + 4] | (block[i + 5] << 8) | (block[i + 6] << 16) | (block[i + 7] << 24);
    }
    keccakF(sLo, sHi);
  };

  while (offset + rate <= bytes.length) {
    block.set(bytes.subarray(offset, offset + rate));
    absorb();
    offset += rate;
  }

  // 마지막 토막 + 채움. 남은 자리를 0 으로 비우고 표시 바이트와 마지막 비트를 박는다.
  block.fill(0);
  block.set(bytes.subarray(offset));
  block[bytes.length - offset] ^= pad;
  block[rate - 1] ^= 0x80;
  absorb();

  // 짜내기 — 512비트까지는 한 번에 나온다(rate 가 더 크다).
  let out = '';
  const outBytes = outBits / 8;
  for (let i = 0; i < outBytes; i++) {
    const w = i >>> 3;
    const shift = (i % 4) * 8;
    const word = i % 8 < 4 ? sLo[w] : sHi[w];
    const b = (word >>> shift) & 0xff;
    out += HEX[b >>> 4] + HEX[b & 15];
  }
  return out;
}

const enc = new TextEncoder();

/** FIPS-202 SHA-3. `sha3sum` · `openssl dgst -sha3-512` 와 같은 값이 나온다. */
export function sha3(text: string, bits: 224 | 256 | 384 | 512 = 512): string {
  return keccakHex(enc.encode(text), bits, 0x06);
}

/** 표준화 이전 Keccak. CryptoJS 의 `SHA3` 이 내던 값과 같다. */
export function keccak(text: string, bits: 224 | 256 | 384 | 512 = 512): string {
  return keccakHex(enc.encode(text), bits, 0x01);
}
