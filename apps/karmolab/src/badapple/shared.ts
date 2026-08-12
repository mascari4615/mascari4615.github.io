/**
 * 굽는 화면과 홈이 함께 보는 **저장 자리** 하나.
 *
 * 왜 따로 뗐나: 홈 쪽 파일은 불러들이는 것만으로 키를 듣기 시작하고 재생을 켤 수 있다.
 * 굽는 화면이 그 파일에서 이름 하나 가져오려다 그 동작까지 같이 들여오면, 굽는 화면에서
 * 엉뚱하게 홈용 장치가 돌아간다. 그래서 이 파일은 **불러들여도 아무 일도 안 일어난다** —
 * 값과, 부를 때만 도는 함수만 둔다.
 *
 * 왜 localStorage 가 아닌가 (TASK-KL-244): 거기는 글자만 담긴다. 바이트를 담으려면 base64 로
 * 펴야 하고 그러면 **4/3 로 불어난다.** 게다가 한도가 대개 5MB 라, 색을 담기 시작하면
 * 30초짜리도 못 들어간다. 넘치면 브라우저가 오류를 던지고 **아무것도 안 담는다** — 굽기는
 * 성공했는데 홈에서는 그대로 기본 클립이 나오는, 증상 없는 실패가 된다.
 * IndexedDB 는 바이트를 그대로 받고 한도도 훨씬 크다.
 */
export const CLIP_STORAGE_KEY = 'karmolab:badapple:clip';

const DB_NAME = 'karmolab-badapple';
const STORE = 'clips';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** 구운 클립을 담는다. 담겼으면 true — 담을 자리가 없어도 굽기 자체는 살아 있어야 한다. */
export async function saveClip(bytes: Uint8Array): Promise<boolean> {
	try {
		const db = await open();
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).put(bytes, CLIP_STORAGE_KEY);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
		});
		db.close();
		// 옛 자리에 남은 것은 지운다 — 두 곳에 있으면 어느 쪽이 최신인지 아무도 모른다.
		try {
			localStorage.removeItem(CLIP_STORAGE_KEY);
		} catch {
			/* 저장을 막아 둔 환경 */
		}
		return true;
	} catch {
		return false;
	}
}

/** 담아 둔 것을 지운다 — 푸는 데 실패한(깨진) 클립을 그대로 두면 켤 때마다 같은 곳에서 막힌다. */
export async function clearClip(): Promise<void> {
	try {
		const db = await open();
		await new Promise<void>((resolve) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).delete(CLIP_STORAGE_KEY);
			tx.oncomplete = () => resolve();
			tx.onerror = () => resolve();
			tx.onabort = () => resolve();
		});
		db.close();
	} catch {
		/* 막아 둔 환경 */
	}
	try {
		localStorage.removeItem(CLIP_STORAGE_KEY);
	} catch {
		/* 막아 둔 환경 */
	}
}

/**
 * 담아 둔 클립. 없으면 `null`.
 *
 * 옛 자리(localStorage 의 base64)에 남아 있으면 **읽어서 새 자리로 옮기고 옛것을 지운다** —
 * 마이그레이션이 스스로 사라지게 해서, 다음 판에는 이 갈래가 아예 안 도는 상태가 된다.
 */
export async function loadClip(): Promise<Uint8Array | null> {
	try {
		const db = await open();
		const found = await new Promise<Uint8Array | null>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readonly');
			const get = tx.objectStore(STORE).get(CLIP_STORAGE_KEY);
			get.onsuccess = () => resolve((get.result as Uint8Array | undefined) ?? null);
			get.onerror = () => reject(get.error);
		});
		db.close();
		if (found) return found;
	} catch {
		/* IndexedDB 를 막아 둔 브라우저 — 아래 옛 자리를 본다 */
	}

	try {
		const stored = localStorage.getItem(CLIP_STORAGE_KEY);
		if (!stored) return null;
		const binary = atob(stored);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		void saveClip(bytes);
		return bytes;
	} catch {
		return null;
	}
}
