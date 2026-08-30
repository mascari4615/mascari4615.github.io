/**
 * 열람 저장(R2)이 소리 없이 불어나 청구서로 튀는 것 막기.
 *
 * 왜 필요한가:
 * - R2 는 쓰는 만큼 청구된다. 상한이 없으면 원본 뿌리에 큰 게 잔뜩 들어온 날
 *   전송기가 그걸 그대로 실어 나른다. 알아채는 시점은 청구서다
 * - 나가는 통신은 0원이라 읽기로는 안 터진다. 터질 수 있는 곳은 **저장량** 한 곳
 *
 * 어떻게 막나:
 * - 전송기와 백필이 **시작 때 총량을 재고**, 보내는 바이트를 더해 간다
 * - 상한을 넘으면 미러링만 끈다. 정본(Drive) 업로드는 계속한다.
 *   실패가 아니라 화면에서 못 봄으로 떨어져야 파일이 안 사라진다
 *
 * 값 (2026-08-29 Cloudflare 공시):
 * - 저장 10 GB-월 무료, 넘으면 GB-월당 $0.015
 * - 쓰기(Class A) 100만/월 무료, 읽기(Class B) 1,000만/월 무료
 * - 나가는 통신 $0
 *
 * 실측 규모: 지금 5.73 GiB / 3,108 객체. 백필이 끝나면 그림, 글 3.3GB + 영상 13.1GB
 * 로 16.4GB 언저리. 그 상태의 값이 월 $0.10 이다. 기본 상한 25 GiB 는 그 위 8GB 여유.
 */

const GB = 1024 * 1024 * 1024;

/** 저장 무료 몫 */
export const FREE_GB = 10;

/** 무료 몫 위로 GB-월당 값 */
export const USD_PER_GB_MONTH = 0.015;

/** 기본 상한. env `FILES_VAULT_R2_MAX_GB` 로 덮어쓴다 */
export const DEFAULT_CAP_GB = 25;

/** 이 비율을 넘으면 경고 */
const WARN_AT = 0.8;

/** 바이트가 한 달에 얼마인가. 무료 몫 아래는 0 */
export function monthlyUsd(bytes) {
    const gb = bytes / GB;
    if (gb <= FREE_GB) return 0;
    return Math.round((gb - FREE_GB) * USD_PER_GB_MONTH * 100) / 100;
}

/**
 * 지금 상태 한 덩이.
 * @param {number} bytes 쓰고 있는 바이트
 * @param {number} [capGb] 상한 GB
 * @returns {{bytes:number, capBytes:number, pct:number, usd:number, level:'ok'|'warn'|'stop'}}
 */
export function budgetState(bytes, capGb = DEFAULT_CAP_GB) {
    const capBytes = capGb * GB;
    const pct = capBytes > 0 ? bytes / capBytes : 1;
    const level = pct >= 1 ? 'stop' : pct >= WARN_AT ? 'warn' : 'ok';
    return { bytes, capBytes, pct, usd: monthlyUsd(bytes), level };
}

/** 사람이 읽는 한 줄 */
export function budgetLine(state) {
    const gb = (n) => `${(n / GB).toFixed(2)} GB`;
    const head = `${gb(state.bytes)} / ${gb(state.capBytes)} (월 $${state.usd.toFixed(2)})`;
    if (state.level === 'stop') return `${head} 상한 넘음. 열람 저장 끔`;
    if (state.level === 'warn') return `${head} 상한의 80% 넘음`;
    return head;
}

/** env 에서 상한 읽기. 값이 없거나 이상하면 기본값 */
export function capFromEnv(env = process.env) {
    const raw = Number(env.FILES_VAULT_R2_MAX_GB);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CAP_GB;
}

/**
 * 쓴 바이트를 세면서 상한을 지키는 것.
 * `teeStore` 의 `allowExtra` 에 물린다. 시작 총량은 밖에서 한 번 재서 넣는다.
 */
export function makeBudget(startBytes, capGb = DEFAULT_CAP_GB) {
    let used = startBytes;
    let stoppedAt = null;
    return {
        get used() {
            return used;
        },
        get stopped() {
            return stoppedAt !== null;
        },
        state() {
            return budgetState(used, capGb);
        },
        /** 이만큼 더 써도 되나. 되면 세고 true */
        allow(bytes) {
            if (stoppedAt !== null) return false;
            const next = used + bytes;
            if (next > capGb * GB) {
                stoppedAt = used;
                return false;
            }
            used = next;
            return true;
        },
    };
}

/** rclone 으로 원격 총량 재기. 못 재면 null (모르면 막지 않는다) */
export async function measureRemote(remote, run) {
    const exec = run ?? defaultRun;
    try {
        const out = await exec(['size', '--json', remote]);
        const parsed = JSON.parse(String(out));
        return typeof parsed.bytes === 'number' ? parsed.bytes : null;
    } catch {
        return null;
    }
}

async function defaultRun(args) {
    const { execFile } = await import('node:child_process');
    return new Promise((resolve, reject) => {
        execFile('rclone', args, { maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
        });
    });
}
