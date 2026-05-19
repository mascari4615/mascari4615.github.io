//! TASK-KL-064 — 데스크톱 알람 (Free Alarm Clock 레퍼런스).
//!
//! 사용자 비전: 밤샘 후에도 "깨어나지 않고는 못 배기게" 만드는 강제 기상.
//! 본 모듈 스코프 = 기본 알람 (MVP) + OS 강제 기상.
//!   dismiss 난이도 미션 / 풀스크린 인터셉트 / 스누즈 강화 = 후속 sub-TASK.
//!
//! 아키텍처 (자율 결정, TASK 시드 § 아키텍처 참조):
//! - 스케줄러 = Rust 백엔드 상주 thread. 위젯 탭 미오픈·트레이 최소화 무관 발화
//!   (프론트 setInterval = 위젯 닫히면 죽음 → 황금의 정신 위반).
//! - store = `app_data_dir/alarms.json` (life-features.json 영속 패턴 재사용).
//!   단일 진실 = `tauri::State<AlarmStore>` (Arc<Mutex<Vec<Alarm>>>).
//! - 발화 = 프론트로 `alarm-fired` 이벤트 emit + 사운드 루프 시작. 발화 창은
//!   프론트(별 윈도우)가 그림. dismiss/snooze 는 명령으로 사운드 정지·재무장.
//! - 사운드 = winapi winmm::PlaySound (SND_LOOP|SND_ASYNC). 네이티브 무한
//!   루프, cpal 비의존(KL-052 사이즈 목표 정합). mp3/ogg = 후속 증분(rodio).
//! - 증분 분리(검증 단위): ① store+스케줄러+사운드(본 커밋) ② OS 강제 기상
//!   (waitable timer/볼륨/모니터, winapi·COM) ③ 프론트 위젯+발화 창.

use chrono::{Datelike, Duration, Local, NaiveDateTime, NaiveTime};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// 알람 1개. 반복 요일 = chrono Weekday::num_days_from_monday (0=월 .. 6=일).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alarm {
    pub id: String,
    #[serde(default)]
    pub label: String,
    pub hour: u8,
    pub minute: u8,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// 빈 배열 = 1회성 (발화 후 enabled=false). 아니면 해당 요일마다 반복.
    #[serde(default)]
    pub repeat: Vec<u8>,
    /// 절대 경로 `.wav`. None = 내장 시스템 알람음 루프.
    #[serde(default)]
    pub sound_path: Option<String>,
    /// 0-100. OS 강제 볼륨 레벨 (증분 ② 에서 실제 적용).
    #[serde(default = "default_volume")]
    pub volume: u8,
    /// 0 = 스누즈 비활성. 아니면 dismiss 대신 스누즈 시 N 분 뒤 재발화.
    #[serde(default)]
    pub snooze_minutes: u32,
    /// OS 강제 기상(절전 깨우기 + 모니터 ON + 볼륨 강제·음소거 무시).
    /// MVP 확정 포함 — 실제 OS 호출은 증분 ②.
    #[serde(default = "default_true")]
    pub force_wake: bool,
}

fn default_true() -> bool {
    true
}
fn default_volume() -> u8 {
    100
}

/// 사용자 입력 sanitize. 시각 범위 + wav 경로 안전(claude_env 패턴 차용).
fn validate_alarm(a: &Alarm) -> Result<(), String> {
    if a.hour > 23 {
        return Err(format!("hour 범위 초과: {}", a.hour));
    }
    if a.minute > 59 {
        return Err(format!("minute 범위 초과: {}", a.minute));
    }
    if a.volume > 100 {
        return Err(format!("volume 범위 초과: {}", a.volume));
    }
    for d in &a.repeat {
        if *d > 6 {
            return Err(format!("repeat 요일 무효(0-6): {}", d));
        }
    }
    if let Some(p) = a.sound_path.as_deref() {
        validate_wav_path(p)?;
    }
    Ok(())
}

/// 절대 경로 + .wav + 위험 문자 거부 (winmm 에 그대로 넘기므로).
fn validate_wav_path(raw: &str) -> Result<(), String> {
    let p = raw.trim();
    if p.is_empty() {
        return Ok(());
    }
    for ch in p.chars() {
        if matches!(ch, '"' | '\n' | '\r' | '\0') {
            return Err(format!("sound_path 허용 안 된 문자: {:?}", ch));
        }
    }
    let abs = (p.len() >= 3
        && p.as_bytes()[1] == b':'
        && (p.as_bytes()[2] == b'\\' || p.as_bytes()[2] == b'/'))
        || p.starts_with("\\\\");
    if !abs {
        return Err(format!("sound_path 는 절대 경로여야 함: {:?}", p));
    }
    if !p.to_ascii_lowercase().ends_with(".wav") {
        return Err(format!("sound_path 는 .wav 만 허용(MVP): {:?}", p));
    }
    Ok(())
}

/// 영속 상태 + 마지막 발화 분(중복 발화 방지) + 스누즈 1회성 큐 + 현재 울리는 알람.
pub struct AlarmStore {
    alarms: Mutex<Vec<Alarm>>,
    path: Mutex<Option<PathBuf>>,
    /// alarm.id → 마지막 발화 "yyyy-mm-dd HHMM" (같은 분 재발화 차단).
    last_fired: Mutex<HashMap<String, String>>,
    /// 스누즈: alarm.id → 재발화 절대 시각(epoch sec). dismiss/발화 시 제거.
    snooze_until: Mutex<HashMap<String, i64>>,
    /// 지금 울리는 알람 (발화 창이 load 시 alarm_active 로 조회). dismiss=None.
    ringing: Mutex<Option<Alarm>>,
}

impl Default for AlarmStore {
    fn default() -> Self {
        Self {
            alarms: Mutex::new(Vec::new()),
            path: Mutex::new(None),
            last_fired: Mutex::new(HashMap::new()),
            snooze_until: Mutex::new(HashMap::new()),
            ringing: Mutex::new(None),
        }
    }
}

impl AlarmStore {
    fn store_path(app: &AppHandle) -> Option<PathBuf> {
        app.path().app_data_dir().ok().map(|p| p.join("alarms.json"))
    }

    /// setup() 에서 1회. 디스크 → 메모리 복원.
    pub fn load_from_disk(&self, app: &AppHandle) {
        let path = Self::store_path(app);
        if let Some(p) = &path {
            if let Ok(json) = std::fs::read_to_string(p) {
                if let Ok(list) = serde_json::from_str::<Vec<Alarm>>(&json) {
                    *self.alarms.lock().unwrap() = list;
                }
            }
        }
        *self.path.lock().unwrap() = path;
    }

    fn persist(&self) {
        let path = self.path.lock().unwrap().clone();
        let Some(path) = path else { return };
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let snapshot = self.alarms.lock().unwrap().clone();
        if let Ok(json) = serde_json::to_string_pretty(&snapshot) {
            let _ = std::fs::write(path, json);
        }
    }

    fn list(&self) -> Vec<Alarm> {
        self.alarms.lock().unwrap().clone()
    }

    fn upsert(&self, alarm: Alarm) {
        let mut guard = self.alarms.lock().unwrap();
        if let Some(slot) = guard.iter_mut().find(|a| a.id == alarm.id) {
            *slot = alarm;
        } else {
            guard.push(alarm);
        }
        drop(guard);
        self.persist();
    }

    fn remove(&self, id: &str) {
        self.alarms.lock().unwrap().retain(|a| a.id != id);
        self.last_fired.lock().unwrap().remove(id);
        self.snooze_until.lock().unwrap().remove(id);
        self.persist();
    }

    fn set_enabled(&self, id: &str, enabled: bool) {
        if let Some(a) = self.alarms.lock().unwrap().iter_mut().find(|a| a.id == id) {
            a.enabled = enabled;
        }
        self.persist();
    }
}

/// 발화 grace 윈도우. 예정시각 ~ 예정+GRACE 사이면 발화(이미 그 occurrence
/// 발화 안 했으면). equality(시:분 정확일치) 모델은 그 1분에 틱이 안 떨어지면
/// (앱 재시작/hot-reload/절전복귀 jitter/IO 스톨) *영구 스킵* → 알람 앱 치명.
/// grace = 짧은 다운/지연을 흡수해 "놓침 없이 (조금 늦더라도) 반드시 발화".
/// 너무 길면 앱을 한참 뒤 열었을 때 옛 알람이 울리니 보수적으로 5분.
/// KL-064: 사용자 "여유 두고 했는데 안 울림" = equality 결함 데이터 확증.
const FIRE_GRACE_MINUTES: i64 = 5;

/// 스케줄러 1 tick: 발화할 알람 id. side-effect 없음(테스트 가능, 시간 pin).
/// `last_fired`: alarm.id → 마지막 발화 occurrence 날짜 "YYYY-MM-DD"
/// (occurrence 당 1회 — 그 날 grace 안에서 여러 틱 떨어져도 1번만).
fn due_alarm_ids(
    alarms: &[Alarm],
    last_fired: &HashMap<String, String>,
    snooze_until: &HashMap<String, i64>,
    now: NaiveDateTime,
    now_epoch: i64,
) -> Vec<String> {
    let today_key = now.date().format("%Y-%m-%d").to_string();
    let today_wd0 = now.date().weekday().num_days_from_monday() as u8;
    let mut due = Vec::new();
    for a in alarms {
        // 스누즈 재발화 최우선 (enabled 무관 — 사용자가 누른 것).
        if let Some(until) = snooze_until.get(&a.id) {
            if now_epoch >= *until {
                due.push(a.id.clone());
            }
            continue;
        }
        if !a.enabled {
            continue;
        }
        // 오늘이 이 알람의 occurrence 인가 (1회성=오늘, 반복=요일 매칭).
        if !a.repeat.is_empty() && !a.repeat.contains(&today_wd0) {
            continue;
        }
        let Some(t) = NaiveTime::from_hms_opt(a.hour as u32, a.minute as u32, 0) else {
            continue;
        };
        let scheduled = now.date().and_time(t);
        // catch-up: 예정 <= now <= 예정+grace (그 1분 정확 일치 불요).
        if now < scheduled || now > scheduled + Duration::minutes(FIRE_GRACE_MINUTES) {
            continue;
        }
        // 이 occurrence(오늘) 이미 발화 → 스킵 (grace 내 중복 차단).
        if last_fired.get(&a.id).map(|s| s.as_str()) == Some(today_key.as_str()) {
            continue;
        }
        due.push(a.id.clone());
    }
    due
}

/// 스케줄러 1 tick 의 *store 부작용 전부* — `now` 주입 = 시간 pin(결정성,
/// process.md § 루프). due 판정 + 스누즈해제 + 중복발화차단 기록 +
/// 1회성 비활성 + ringing 기록. **반환 = 발화할 알람들**. OS/Tauri 부작용
/// (oswake/sound/window/emit) 은 호출자(thread)가 — 그래야 이 함수가
/// Tauri 런타임 없이 단위 테스트 가능 (올바른 seam).
fn pump(store: &AlarmStore, now: chrono::DateTime<Local>) -> Vec<Alarm> {
    let now_naive = now.naive_local();
    // last_fired 값 = occurrence 날짜 (occurrence 당 1회 발화 dedupe).
    let today_key = now_naive.date().format("%Y-%m-%d").to_string();
    let alarms = store.list();
    let last = store.last_fired.lock().unwrap().clone();
    let snz = store.snooze_until.lock().unwrap().clone();
    let due = due_alarm_ids(&alarms, &last, &snz, now_naive, now.timestamp());

    let mut fired = Vec::new();
    for id in due {
        store.snooze_until.lock().unwrap().remove(&id);
        store
            .last_fired
            .lock()
            .unwrap()
            .insert(id.clone(), today_key.clone());
        let Some(alarm) = alarms.iter().find(|a| a.id == id).cloned() else {
            continue;
        };
        // 1회성(반복 없음) → 발화 후 비활성. 스누즈 재발화는 snooze_until
        // 분기로 들어와 여기 도달해도 repeat 비었으면 비활성(이미 1회성).
        if alarm.repeat.is_empty() {
            store.set_enabled(&id, false);
        }
        *store.ringing.lock().unwrap() = Some(alarm.clone());
        fired.push(alarm);
    }
    fired
}

/// 상주 스케줄러 스레드 — setup() 에서 1회 spawn. activity tracker 선례 동일.
pub fn start_scheduler(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(5));
        let store = app.state::<AlarmStore>();
        for alarm in pump(&store, Local::now()) {
            // fire() 패닉이 스케줄러 스레드(→ 프로세스)를 절대 못 죽이게 격리.
            // 한 알람 발화 실패가 이후 모든 알람을 잃게 하면 알람앱 치명.
            let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                fire(&app, &alarm)
            }));
            if res.is_err() {
                eprintln!("[alarm] fire 패닉 격리됨 (id={}) — 스케줄러 생존", alarm.id);
            }
        }
    });
}

/// 발화 *OS/Tauri 부작용* — ringing 기록은 pump 가 이미 함.
/// (강제기상) 모니터 ON+볼륨 → 사운드 루프 → 발화 창 표시 → 프론트 이벤트.
fn fire(app: &AppHandle, alarm: &Alarm) {
    if alarm.force_wake {
        oswake::keep_display_on();
        // 알람별 *지정* 볼륨으로 정확히 + 음소거 해제 (Core Audio).
        audio::force_to(alarm.volume);
    }
    sound::start_loop(alarm.sound_path.as_deref());
    show_alarm_window(app);
    let _ = app.emit("alarm-fired", alarm.clone());
}

/// 발화 창 = label "alarm" WebviewWindow. main 윈도우의 *실제* URL(dev/prod/
/// dev-mode 토글 무관)을 읽어 `#alarm-fire` fragment 만 덧붙임 — 하드코딩 X
/// (WebviewUrl::External 은 tauri.conf dev/prod 자동전환 비적용이므로 필수).
/// 풀스크린 + always-on-top + skip-taskbar (단순 dismiss, 풀스크린 인터셉트
/// 강화는 후속). 이미 있으면 focus 만.
fn show_alarm_window(app: &AppHandle) {
    // URL 계산은 어느 스레드서나 OK(소유데이터 반환). 실제 윈도우 생성은
    // **메인 스레드 필수** — Tauri WebviewWindowBuilder::build() 를 스케줄러
    // 워커스레드서 호출하면 Windows 에서 비신뢰(무반응/크래시). run_on_main_
    // thread 로 마샬 (KL-064: 사용자 "발화 로그는 찍히는데 아무 반응 없음").
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    let Ok(mut url) = main.url() else { return };
    url.set_fragment(Some("alarm-fire"));
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(w) = app2.get_webview_window("alarm") {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
            return;
        }
        match tauri::WebviewWindowBuilder::new(&app2, "alarm", tauri::WebviewUrl::External(url))
            .title("KarmoLab 알람")
            .fullscreen(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .decorations(false)
            .focused(true)
            .build()
        {
            Ok(_) => {}
            Err(e) => eprintln!("[alarm] 발화 창 생성 실패: {e}"),
        }
    });
}

/// dismiss/snooze 공통 정리 — ringing 해제 + 발화 창 닫기 + 잠금방지 해제.
fn close_ring(app: &AppHandle, store: &AlarmStore) {
    sound::stop();
    oswake::release_display();
    *store.ringing.lock().unwrap() = None;
    if let Some(w) = app.get_webview_window("alarm") {
        let _ = w.destroy();
    }
}

/// 알람 1개의 `now` 이후 다음 발화 시각(로컬 naive). 비활성/계산불가 = None.
/// 1회성 = 오늘 그 시각이 미래면 오늘, 아니면 내일. 반복 = 7일 내 다음 매칭 요일.
/// 절전 resume 타이머가 "다음 깨울 절대시각" 산출에 사용 (순수 fn = 테스트 가능).
fn next_fire_after(now: NaiveDateTime, a: &Alarm) -> Option<NaiveDateTime> {
    if !a.enabled {
        return None;
    }
    let t = NaiveTime::from_hms_opt(a.hour as u32, a.minute as u32, 0)?;
    if a.repeat.is_empty() {
        let today = now.date().and_time(t);
        Some(if today > now {
            today
        } else {
            today + Duration::days(1)
        })
    } else {
        for add in 0..8 {
            let d = now.date() + Duration::days(add);
            let wd = d.weekday().num_days_from_monday() as u8;
            if a.repeat.contains(&wd) {
                let cand = d.and_time(t);
                if cand > now {
                    return Some(cand);
                }
            }
        }
        None
    }
}

/// 모든 활성 알람 중 가장 이른 다음 발화 시각. (스누즈는 앱-깨어있음 단기라
/// resume 타이머 대상 아님 — 5s 스케줄러가 처리. sleep-wake 는 예약 알람용.)
fn earliest_next_fire(alarms: &[Alarm], now: NaiveDateTime) -> Option<NaiveDateTime> {
    alarms.iter().filter_map(|a| next_fire_after(now, a)).min()
}

// ───────────────── OS 강제 기상 (winapi, 절전 resume / 모니터 / 볼륨) ─────────────────
// 증분②. 사용자 컨펌 MVP 포함. winapi 잔존 — 백엔드 마이그 = KL-055-B 결정 게이트.
//   ("windows crate 미도입 — 사이즈" 전제는 무효: windows crate 이미 트랜지티브
//    컴파일 중. 분석·권고 = src-tauri/ALARM-COM-BACKEND-DECISION.md)
// 정밀 per-alarm 볼륨 레벨(Core Audio IAudioEndpointVolume) = 후속 증분.
#[cfg(windows)]
pub mod oswake {
    use std::mem;
    use winapi::shared::minwindef::{FALSE, TRUE};
    use winapi::shared::windef::HWND;
    use winapi::um::handleapi::CloseHandle;
    use winapi::um::synchapi::{CreateWaitableTimerW, SetWaitableTimer, WaitForSingleObject};
    use winapi::um::winbase::SetThreadExecutionState;
    use winapi::um::winnt::{
        ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED, LARGE_INTEGER,
    };
    use winapi::um::winuser::{
        mouse_event, SendMessageTimeoutW, HWND_BROADCAST, MOUSEEVENTF_MOVE, SC_MONITORPOWER,
        SMTO_ABORTIFHUNG, WM_SYSCOMMAND,
    };

    /// ring 동안 시스템/디스플레이 OFF 차단 + 꺼진 모니터 깨우기.
    /// (볼륨은 `super::audio::force_to` 담당 — 관심사 분리.)
    ///
    /// **KL-064 근본**: 옛 코드는 `SendMessageW(HWND_BROADCAST, …)` =
    /// *모든 최상위 창이 처리할 때까지 동기 블록*. 멈춘 창 1개라도 있으면
    /// 무한 대기 → 스케줄러 워커스레드가 fire() 1단계서 영영 갇혀 소리/창
    /// 0 (계측 `fire enter` 뒤 `keep_display_on done` 안 찍힘으로 실증).
    /// fix: ① SetThreadExecutionState(즉시·sleep방지 핵심)만 인라인
    ///      ② 모니터-깨우기 broadcast 는 best-effort → 별 스레드 +
    ///         SendMessageTimeoutW(SMTO_ABORTIFHUNG, 타임아웃) → fire() 는
    ///         절대 여기서 못 막힘(critical path 격리).
    pub fn keep_display_on() {
        unsafe {
            SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
        }
        // best-effort 모니터 ON — fire 경로와 격리(blocking 불가).
        std::thread::spawn(|| unsafe {
            let mut res: usize = 0;
            SendMessageTimeoutW(
                HWND_BROADCAST as HWND,
                WM_SYSCOMMAND,
                SC_MONITORPOWER as usize,
                -1isize, // -1 = power on
                SMTO_ABORTIFHUNG,
                1500,
                &mut res,
            );
            mouse_event(MOUSEEVENTF_MOVE, 1, 0, 0, 0);
            mouse_event(MOUSEEVENTF_MOVE, 0u32.wrapping_sub(1), 0, 0, 0);
        });
    }

    /// dismiss/snooze 시 잠금 방지 해제 (ES_CONTINUOUS 단독 = 정책 복구).
    pub fn release_display() {
        unsafe {
            SetThreadExecutionState(ES_CONTINUOUS);
        }
    }

    /// 절전 resume 대기 타이머 스레드. 다음 발화 ~30s 전으로 resume 타이머를
    /// 무장 → 시스템이 절전이어도 깨어나 5s 스케줄러가 발화. 알람 변경 반영
    /// 위해 최대 60s 마다 재평가(재무장). HANDLE 은 Send 아님 → 스레드 내 생성.
    pub fn start_wake_timer(app: tauri::AppHandle) {
        use tauri::Manager;
        std::thread::spawn(move || unsafe {
            let timer = CreateWaitableTimerW(std::ptr::null_mut(), FALSE, std::ptr::null());
            if timer.is_null() {
                eprintln!("[alarm] CreateWaitableTimer 실패 — 절전 wake 비활성");
                return;
            }
            loop {
                let store = app.state::<super::AlarmStore>();
                let now = chrono::Local::now().naive_local();
                let alarms = store.list();
                let wait_ms: u32 = match super::earliest_next_fire(&alarms, now) {
                    Some(next) => {
                        let fire_at = next - chrono::Duration::seconds(30);
                        let rel_secs = (fire_at - now).num_seconds().max(1);
                        // 음수 = 상대시간(100ns 단위). fResume=TRUE → 절전서 깨움.
                        let mut due: LARGE_INTEGER = mem::zeroed();
                        *due.QuadPart_mut() = -(rel_secs * 10_000_000);
                        SetWaitableTimer(
                            timer,
                            &due,
                            0,
                            None,
                            std::ptr::null_mut(),
                            TRUE,
                        );
                        // 최대 60s 마다 재평가(알람 편집 픽업) — resume 타이머는
                        // 절대 타깃으로 무장돼 있어 그 사이 절전돼도 깨움.
                        ((rel_secs * 1000).min(60_000)) as u32
                    }
                    None => 60_000,
                };
                WaitForSingleObject(timer, wait_ms);
            }
            #[allow(unreachable_code)]
            {
                CloseHandle(timer);
            }
        });
    }
}

#[cfg(not(windows))]
pub mod oswake {
    pub fn keep_display_on() {}
    pub fn release_display() {}
    pub fn start_wake_timer(_app: tauri::AppHandle) {}
}

// ───── 볼륨 제어 (프로덕션, Core Audio IAudioEndpointVolume) ─────
// 알람별 *지정* 볼륨을 정확히 세팅 + 음소거 해제. (구 keybd VK_VOLUME_UP×50
// = "무조건 MAX 로 밀기" 만 가능 → 위젯 볼륨 슬라이더 실효 없음 = 레거시,
// 본 모듈로 자기소멸.) Core Audio 실패 시에만 keybd 폴백.
// get/set 은 비파괴 검증 테스트도 재사용 (단일 정본).
#[cfg(windows)]
pub mod audio {
    use winapi::shared::winerror::SUCCEEDED;
    use winapi::um::combaseapi::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL};
    use winapi::um::endpointvolume::IAudioEndpointVolume;
    use winapi::um::mmdeviceapi::{
        eConsole, eRender, CLSID_MMDeviceEnumerator, IMMDeviceEnumerator,
    };
    use winapi::um::objbase::COINIT_APARTMENTTHREADED;
    use winapi::um::winuser::{keybd_event, KEYEVENTF_KEYUP, VK_VOLUME_UP};
    use winapi::Interface;

    /// COM 초기화 → 기본 렌더 엔드포인트의 IAudioEndpointVolume 으로 f 실행.
    unsafe fn with_epv<R>(f: impl FnOnce(*mut IAudioEndpointVolume) -> R) -> Option<R> {
        if !SUCCEEDED(CoInitializeEx(std::ptr::null_mut(), COINIT_APARTMENTTHREADED)) {
            return None;
        }
        let mut enom: *mut IMMDeviceEnumerator = std::ptr::null_mut();
        let hr = CoCreateInstance(
            &CLSID_MMDeviceEnumerator,
            std::ptr::null_mut(),
            CLSCTX_ALL,
            &IMMDeviceEnumerator::uuidof(),
            &mut enom as *mut _ as *mut *mut winapi::ctypes::c_void,
        );
        let mut result = None;
        if SUCCEEDED(hr) && !enom.is_null() {
            let mut dev = std::ptr::null_mut();
            if SUCCEEDED((*enom).GetDefaultAudioEndpoint(eRender, eConsole, &mut dev))
                && !dev.is_null()
            {
                let mut epv: *mut IAudioEndpointVolume = std::ptr::null_mut();
                if SUCCEEDED((*dev).Activate(
                    &IAudioEndpointVolume::uuidof(),
                    CLSCTX_ALL,
                    std::ptr::null_mut(),
                    &mut epv as *mut _ as *mut *mut winapi::ctypes::c_void,
                )) && !epv.is_null()
                {
                    result = Some(f(epv));
                    (*epv).Release();
                }
                (*dev).Release();
            }
            (*enom).Release();
        }
        CoUninitialize();
        result
    }

    /// (마스터 볼륨 scalar 0..1, muted?). 검증/베이스라인용.
    pub fn get_master() -> Option<(f32, bool)> {
        unsafe {
            with_epv(|epv| {
                let mut vol: f32 = -1.0;
                let mut mute: i32 = 0;
                (*epv).GetMasterVolumeLevelScalar(&mut vol);
                (*epv).GetMute(&mut mute);
                (vol, mute != 0)
            })
        }
    }

    /// 마스터 볼륨 scalar(0..1) + 뮤트 설정. 성공 여부.
    pub fn set_master(scalar: f32, mute: bool) -> bool {
        unsafe {
            with_epv(|epv| {
                let a = (*epv).SetMasterVolumeLevelScalar(scalar.clamp(0.0, 1.0), std::ptr::null_mut());
                let b = (*epv).SetMute(if mute { 1 } else { 0 }, std::ptr::null_mut());
                SUCCEEDED(a) && SUCCEEDED(b)
            })
            .unwrap_or(false)
        }
    }

    /// 알람 발화: 시스템 볼륨을 알람 지정값(0-100%)으로 *정확히* + 음소거 해제.
    /// Core Audio 실패(드라이버/COM) 시에만 keybd VK_VOLUME_UP 폴백(MAX 근접).
    pub fn force_to(vol_pct: u8) {
        let scalar = (vol_pct.min(100) as f32) / 100.0;
        if set_master(scalar, false) {
            return;
        }
        eprintln!("[alarm] Core Audio 볼륨 set 실패 — keybd VK_VOLUME_UP 폴백");
        unsafe {
            for _ in 0..50 {
                keybd_event(VK_VOLUME_UP as u8, 0, 0, 0);
                keybd_event(VK_VOLUME_UP as u8, 0, KEYEVENTF_KEYUP, 0);
            }
        }
    }
}

#[cfg(not(windows))]
pub mod audio {
    pub fn get_master() -> Option<(f32, bool)> {
        None
    }
    pub fn set_master(_scalar: f32, _mute: bool) -> bool {
        false
    }
    pub fn force_to(_vol_pct: u8) {}
}

// ───────────────────────── 사운드 (winmm, 무한 루프) ─────────────────────────
mod sound {
    /// wav 경로 = SND_FILENAME|SND_LOOP|SND_ASYNC. None = 시스템 알람음 alias 루프.
    /// 비-Windows = no-op (KarmoLab = Windows 데스크톱 전용, life/state 동일 전제).
    #[cfg(windows)]
    pub fn start_loop(wav_path: Option<&str>) {
        use std::os::windows::ffi::OsStrExt;
        use winapi::um::playsoundapi::{
            PlaySoundW, SND_ALIAS, SND_ASYNC, SND_FILENAME, SND_LOOP, SND_NODEFAULT,
        };

        let (text, flags): (Vec<u16>, u32) = match wav_path {
            Some(p) if !p.trim().is_empty() => (
                std::ffi::OsStr::new(p)
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect(),
                SND_FILENAME | SND_LOOP | SND_ASYNC | SND_NODEFAULT,
            ),
            // 내장: Windows "SystemExclamation" 이벤트 사운드를 루프.
            _ => (
                std::ffi::OsStr::new("SystemExclamation")
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect(),
                SND_ALIAS | SND_LOOP | SND_ASYNC,
            ),
        };
        unsafe {
            PlaySoundW(text.as_ptr(), std::ptr::null_mut(), flags);
        }
    }

    /// 재생 중인 루프 정지 (dismiss / snooze 공용).
    #[cfg(windows)]
    pub fn stop() {
        use winapi::um::playsoundapi::PlaySoundW;
        unsafe {
            PlaySoundW(std::ptr::null(), std::ptr::null_mut(), 0);
        }
    }

    #[cfg(not(windows))]
    pub fn start_loop(_wav_path: Option<&str>) {}
    #[cfg(not(windows))]
    pub fn stop() {}
}

// ───────────────────────────── #[tauri::command] ─────────────────────────────
// 등록: acl.toml [[group]] name="alarm" 1줄 (build.rs 자동 파생, KL-063).
// 전부 sync — store R/W < 10ms 단일 파일 (KL-043 기준 sync OK).

#[tauri::command]
pub fn alarm_list(store: tauri::State<AlarmStore>) -> Vec<Alarm> {
    store.list()
}

#[tauri::command]
pub fn alarm_upsert(alarm: Alarm, store: tauri::State<AlarmStore>) -> Result<(), String> {
    validate_alarm(&alarm)?;
    store.upsert(alarm);
    Ok(())
}

#[tauri::command]
pub fn alarm_remove(id: String, store: tauri::State<AlarmStore>) {
    store.remove(&id);
}

#[tauri::command]
pub fn alarm_set_enabled(id: String, enabled: bool, store: tauri::State<AlarmStore>) {
    store.set_enabled(&id, enabled);
}

/// 발화 창이 load 시 "지금 울리는 알람" 조회 (없으면 null).
#[tauri::command]
pub fn alarm_active(store: tauri::State<AlarmStore>) -> Option<Alarm> {
    store.ringing.lock().unwrap().clone()
}

/// 발화 중인 알람 정지. 프론트 발화 창의 "끄기" 가 호출.
#[tauri::command]
pub fn alarm_dismiss(id: String, app: AppHandle, store: tauri::State<AlarmStore>) {
    close_ring(&app, &store);
    store.snooze_until.lock().unwrap().remove(&id);
}

/// 스누즈: 사운드 정지 + 발화 창 닫기 + N 분 뒤 재발화 예약.
/// snooze_minutes==0 이면 dismiss 와 동일.
#[tauri::command]
pub fn alarm_snooze(
    id: String,
    app: AppHandle,
    store: tauri::State<AlarmStore>,
) -> Result<(), String> {
    close_ring(&app, &store);
    let minutes = store
        .alarms
        .lock()
        .unwrap()
        .iter()
        .find(|a| a.id == id)
        .map(|a| a.snooze_minutes)
        .ok_or_else(|| format!("알람 없음: {id}"))?;
    if minutes == 0 {
        store.snooze_until.lock().unwrap().remove(&id);
        return Ok(());
    }
    let until = Local::now().timestamp() + (minutes as i64) * 60;
    store.snooze_until.lock().unwrap().insert(id, until);
    Ok(())
}

// ───────────────────────────── autostart (Windows) ─────────────────────────────
// 재부팅 후에도 알람 보장 = HKCU\...\Run 레지스트리. reg.exe shell-out
// (claude_env PowerShell shell-out 선례 — 신규 crate 0). 사용자 토글 영속:
// app_data_dir/alarm-settings.json {autostart:bool} (default true = 핵심 약속).
const RUN_VALUE_NAME: &str = "KarmoLabAlarm";

#[derive(Serialize, Deserialize)]
struct AlarmSettings {
    #[serde(default = "default_true")]
    autostart: bool,
}
impl Default for AlarmSettings {
    fn default() -> Self {
        Self { autostart: true }
    }
}

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|p| p.join("alarm-settings.json"))
}

fn read_settings(app: &AppHandle) -> AlarmSettings {
    settings_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_settings(app: &AppHandle, s: &AlarmSettings) {
    if let Some(p) = settings_path(app) {
        if let Some(parent) = p.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(s) {
            let _ = std::fs::write(p, json);
        }
    }
}

/// 레지스트리 Run 키를 pref 에 맞춰 동기화. 현재 exe 경로 등록/삭제. idempotent.
#[cfg(windows)]
fn apply_autostart(enabled: bool) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let run_key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    let mut cmd = Command::new("reg");
    if enabled {
        let exe = std::env::current_exe()
            .map_err(|e| format!("current_exe 실패: {e}"))?
            .to_string_lossy()
            .into_owned();
        cmd.args([
            "add", run_key, "/v", RUN_VALUE_NAME, "/t", "REG_SZ", "/d", &exe, "/f",
        ]);
    } else {
        cmd.args(["delete", run_key, "/v", RUN_VALUE_NAME, "/f"]);
    }
    cmd.creation_flags(CREATE_NO_WINDOW);
    let out = cmd.output().map_err(|e| format!("reg spawn 실패: {e}"))?;
    // delete 는 키 없으면 exit!=0 — disable 요청엔 무해(이미 없음).
    if !out.status.success() && enabled {
        return Err(format!(
            "reg add 실패: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn apply_autostart(_enabled: bool) -> Result<(), String> {
    Ok(())
}

/// setup() 에서 1회 — 저장된 pref(default ON) 를 레지스트리에 반영.
/// 재부팅 후 알람 보장의 전제.
pub fn ensure_autostart(app: &AppHandle) {
    let s = read_settings(app);
    if let Err(e) = apply_autostart(s.autostart) {
        eprintln!("[alarm] autostart 동기화 실패: {e}");
    }
}

#[tauri::command]
pub fn alarm_get_autostart(app: AppHandle) -> bool {
    read_settings(&app).autostart
}

#[tauri::command]
pub fn alarm_set_autostart(enabled: bool, app: AppHandle) -> Result<(), String> {
    apply_autostart(enabled)?;
    write_settings(&app, &AlarmSettings { autostart: enabled });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 알람별 *지정* 볼륨 정확 적용 비파괴 검증 — read→baseline(5%+뮤트)→
    /// `audio::force_to(70)` → assert(≈0.70 ±tol + unmute)→원복.
    /// 단순 "≥0.5/MAX" 가 아니라 *지정값 정확도* 까지 검증(위젯 슬라이더 실효).
    /// `#[ignore]` = 시스템 볼륨을 잠깐 만지고 오디오 엔드포인트 필요 →
    /// 일반 `cargo test`/CI(=cargo check) 제외, 명시 실행:
    /// `cargo test --lib volume_force -- --ignored`
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn volume_force_sets_exact_level_and_unmutes() {
        let Some((orig_vol, orig_mute)) = super::audio::get_master() else {
            eprintln!("[skip] 오디오 엔드포인트 없음 (헤드리스/CI)");
            return;
        };
        // 베이스라인: 확실히 낮게 + 뮤트 → 지정값 적용이 명확히 보이게.
        assert!(super::audio::set_master(0.05, true), "베이스라인 set 실패");
        std::thread::sleep(std::time::Duration::from_millis(150));
        let (base_vol, base_mute) = super::audio::get_master().unwrap();
        assert!(base_vol < 0.2 && base_mute, "베이스라인 미적용: {base_vol} {base_mute}");

        // 알람이 volume=70 으로 발화한 것과 동일 경로.
        super::audio::force_to(70);
        std::thread::sleep(std::time::Duration::from_millis(200));
        let (new_vol, new_mute) = super::audio::get_master().unwrap();

        // 원복 먼저 (assert 실패해도 사용자 환경 보존).
        super::audio::set_master(orig_vol, orig_mute);

        assert!(
            (new_vol - 0.70).abs() < 0.05,
            "지정 볼륨 부정확: 70% 요청 → {new_vol} (baseline {base_vol})"
        );
        assert!(!new_mute, "force 후 음소거 해제 안 됨");
    }

    /// END-TO-END (GUI 없이): 실 store + 실 시계 + 실 pump + 실 Core Audio.
    /// "지금 분" 알람(volume=33) 시드 → `pump(now)` 가 발화 판정 →
    /// fire() 의 볼륨 라인(`audio::force_to(alarm.volume)`)과 동일 호출 →
    /// 시스템 볼륨이 0.33 이 됐는지 readback → 원복. 스케줄러→발화→OS볼륨
    /// 전 경로를 라이브 머신에서 비파괴 증명 (미커버 = Tauri 창/사운드/emit).
    /// `cargo test --lib scheduler_to_volume_end_to_end -- --ignored`
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn scheduler_to_volume_end_to_end() {
        use chrono::Timelike;
        let Some((ov, om)) = super::audio::get_master() else {
            eprintln!("[skip] 오디오 엔드포인트 없음");
            return;
        };
        super::audio::set_master(0.05, true); // 베이스라인
        std::thread::sleep(std::time::Duration::from_millis(120));

        let store = AlarmStore::default();
        let now = Local::now();
        let mut a = mk("e2e", now.hour() as u8, now.minute() as u8, vec![], true);
        a.volume = 33;
        a.force_wake = true;
        store.upsert(a);

        // 실제 스케줄러 1 tick (실 시계).
        let fired = pump(&store, now);

        // fire() 의 OS 볼륨 라인과 동일 (창/사운드/emit 은 Tauri 의존이라 제외).
        for al in &fired {
            if al.force_wake {
                super::audio::force_to(al.volume);
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
        let (nv, nm) = super::audio::get_master().unwrap();
        super::audio::set_master(ov, om); // 원복 먼저

        assert_eq!(fired.len(), 1, "스케줄러가 '지금 분' 알람 발화 안 함");
        assert_eq!(fired[0].id, "e2e");
        assert!(
            (nv - 0.33).abs() < 0.05,
            "end-to-end 볼륨 불일치: 33% 기대 → {nv}"
        );
        assert!(!nm, "end-to-end 음소거 해제 안 됨");
    }

    /// HKCU Run 값 조회 (없으면 None, 있으면 데이터 문자열).
    #[cfg(windows)]
    fn query_run(name: &str) -> Option<String> {
        let out = std::process::Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                name,
            ])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let s = String::from_utf8_lossy(&out.stdout);
        // 값 라인: "<name>    REG_SZ    <data>" — REG_SZ 뒤가 데이터(공백 포함 가능).
        for line in s.lines() {
            if line.contains(name) {
                if let Some(idx) = line.find("REG_SZ") {
                    return Some(line[idx + "REG_SZ".len()..].trim().to_string());
                }
            }
        }
        None
    }

    /// autostart 레지스트리 로직 비파괴 검증 — 선상태 save → add 확인 →
    /// delete 확인 → 원복(재부팅 X, 라이브 머신 무손상). 사용자 승인(2026-05-17).
    /// `#[ignore]`: 실제 HKCU Run 을 잠깐 만짐 → CI(cargo check)·일반 test 제외.
    /// 실행: `cargo test --lib autostart_registry -- --ignored`
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn autostart_registry_roundtrip_nondestructive() {
        let prior = query_run(super::RUN_VALUE_NAME); // 선상태 보존

        super::apply_autostart(true).expect("apply_autostart(true) 실패");
        let after_on = query_run(super::RUN_VALUE_NAME);
        let exe = std::env::current_exe()
            .unwrap()
            .to_string_lossy()
            .into_owned();

        super::apply_autostart(false).expect("apply_autostart(false) 실패");
        let after_off = query_run(super::RUN_VALUE_NAME);

        // 원복 먼저 (assert 실패해도 사용자 환경 보존).
        match &prior {
            Some(v) => {
                let _ = std::process::Command::new("reg")
                    .args([
                        "add",
                        r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                        "/v",
                        super::RUN_VALUE_NAME,
                        "/t",
                        "REG_SZ",
                        "/d",
                        v,
                        "/f",
                    ])
                    .output();
            }
            None => { /* step3 에서 이미 삭제됨 = 선상태(부재)와 동일 */ }
        }

        assert!(
            after_on.as_deref() == Some(exe.as_str()),
            "add 후 Run 값이 현재 exe 와 불일치: {after_on:?} != {exe}"
        );
        assert!(
            after_off.is_none(),
            "delete 후에도 Run 값 잔존: {after_off:?}"
        );
    }

    #[test]
    fn alarm_settings_default_is_autostart_on() {
        let s = AlarmSettings::default();
        assert!(s.autostart, "autostart 기본값 = ON (재부팅 후 알람 보장 약속)");
        // serde default: 빈/부분 JSON 도 autostart=true 로 복원.
        let parsed: AlarmSettings = serde_json::from_str("{}").unwrap();
        assert!(parsed.autostart);
    }

    fn mk(id: &str, h: u8, m: u8, repeat: Vec<u8>, enabled: bool) -> Alarm {
        Alarm {
            id: id.into(),
            label: String::new(),
            hour: h,
            minute: m,
            enabled,
            repeat,
            sound_path: None,
            volume: 100,
            snooze_minutes: 9,
            force_wake: true,
        }
    }

    fn due_at(alarms: &[Alarm], last: &HashMap<String, String>, when: &str) -> Vec<String> {
        let n = dt(when);
        due_alarm_ids(alarms, last, &HashMap::new(), n, n.and_utc().timestamp())
    }

    #[test]
    fn fires_at_scheduled_minute() {
        let a = vec![mk("a", 6, 30, vec![], true)];
        // 예정 직전 = X
        assert!(due_at(&a, &HashMap::new(), "2026-05-17 06:29").is_empty());
        // 예정 정각 = 발화
        assert_eq!(due_at(&a, &HashMap::new(), "2026-05-17 06:30"), vec!["a".to_string()]);
    }

    #[test]
    fn catch_up_fires_within_grace_then_stops() {
        // KL-064 회귀: equality 면 이 분에 틱 못 떨어지면 영구 스킵.
        let a = vec![mk("a", 15, 22, vec![], true)];
        // 2분 늦게(앱 재시작/절전복귀로 정각 틱 놓침) → 여전히 발화 (catch-up).
        assert_eq!(due_at(&a, &HashMap::new(), "2026-05-17 15:24"), vec!["a".to_string()]);
        // grace(5분) 경계 = 발화
        assert_eq!(due_at(&a, &HashMap::new(), "2026-05-17 15:27"), vec!["a".to_string()]);
        // grace 초과 = 스킵 (한참 뒤 앱 열어도 옛 알람 안 울림)
        assert!(due_at(&a, &HashMap::new(), "2026-05-17 15:28").is_empty());
    }

    #[test]
    fn no_double_fire_same_occurrence() {
        // last_fired = occurrence 날짜. 같은 날 grace 안 다른 틱이어도 1회만.
        let a = vec![mk("a", 6, 30, vec![], true)];
        let mut last = HashMap::new();
        last.insert("a".to_string(), "2026-05-17".to_string());
        assert!(due_at(&a, &last, "2026-05-17 06:30").is_empty());
        assert!(due_at(&a, &last, "2026-05-17 06:33").is_empty());
        // 다음 날(반복 알람이라면)은 새 occurrence → 다시 발화 가능
        let rep = vec![mk("a", 6, 30, vec![0, 1, 2, 3, 4, 5, 6], true)];
        assert_eq!(due_at(&rep, &last, "2026-05-18 06:30"), vec!["a".to_string()]);
    }

    #[test]
    fn repeat_day_filter() {
        // repeat=[0(월)], 2026-05-17=일(wd0=6) → X
        let a = vec![mk("a", 6, 30, vec![0], true)];
        assert!(due_at(&a, &HashMap::new(), "2026-05-17 06:30").is_empty());
        // 2026-05-18=월(wd0=0) → 발화
        assert_eq!(due_at(&a, &HashMap::new(), "2026-05-18 06:30"), vec!["a".to_string()]);
    }

    #[test]
    fn disabled_alarm_skipped() {
        let a = vec![mk("a", 6, 30, vec![], false)];
        assert!(due_at(&a, &HashMap::new(), "2026-05-17 06:30").is_empty());
    }

    #[test]
    fn snooze_refires_when_due_even_if_disabled() {
        let alarms = vec![mk("a", 6, 30, vec![], false)];
        let mut snz = HashMap::new();
        snz.insert("a".to_string(), 1000);
        let n = dt("2026-05-17 09:00");
        // now_epoch < until → 아직 X (스누즈는 epoch 비교, 시각 무관).
        let early = due_alarm_ids(&alarms, &HashMap::new(), &snz, n, 999);
        assert!(early.is_empty());
        // now_epoch >= until → 재발화 (enabled/요일/시각 무관).
        let late = due_alarm_ids(&alarms, &HashMap::new(), &snz, n, 1000);
        assert_eq!(late, vec!["a".to_string()]);
    }

    fn dt(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap()
    }

    fn ldt(s: &str) -> chrono::DateTime<Local> {
        use chrono::TimeZone;
        Local.from_local_datetime(&dt(s)).unwrap()
    }

    // ── pump = 스케줄러 1 tick 의 store 부작용 전부 (Tauri 런타임 없이 검증) ──

    #[test]
    fn pump_one_shot_fires_disables_sets_ringing_and_dedupes() {
        let store = AlarmStore::default(); // path=None → persist no-op
        store.upsert(mk("a", 6, 30, vec![], true));

        // 06:29 → 미발화.
        assert!(pump(&store, ldt("2026-05-17 06:29")).is_empty());
        assert!(store.ringing.lock().unwrap().is_none());

        // 06:30 → 발화 1개 + 1회성 비활성 + ringing 기록.
        let fired = pump(&store, ldt("2026-05-17 06:30"));
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].id, "a");
        assert_eq!(store.list()[0].enabled, false, "1회성 발화 후 비활성");
        assert_eq!(store.ringing.lock().unwrap().as_ref().unwrap().id, "a");

        // 같은 분 재tick → 중복 발화 차단 (last_fired).
        assert!(pump(&store, ldt("2026-05-17 06:30")).is_empty());
    }

    #[test]
    fn pump_repeat_alarm_stays_enabled() {
        let store = AlarmStore::default();
        // 2026-05-17 = 일(weekday0=6). repeat=[6] → 그 날 발화, 비활성 X.
        store.upsert(mk("r", 6, 30, vec![6], true));
        let fired = pump(&store, ldt("2026-05-17 06:30"));
        assert_eq!(fired.len(), 1);
        assert_eq!(store.list()[0].enabled, true, "반복 알람은 발화해도 유지");
    }

    #[test]
    fn pump_snooze_refires_then_clears() {
        let store = AlarmStore::default();
        store.upsert(mk("s", 6, 30, vec![], false)); // 비활성이어도 스누즈는 발화
        let until = ldt("2026-05-17 09:00").timestamp();
        store.snooze_until.lock().unwrap().insert("s".into(), until);

        // 스누즈 시각 전 → 미발화.
        assert!(pump(&store, ldt("2026-05-17 08:59")).is_empty());
        // 스누즈 시각 도달 → 발화 + snooze_until 제거.
        let fired = pump(&store, ldt("2026-05-17 09:00"));
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].id, "s");
        assert!(store.snooze_until.lock().unwrap().is_empty(), "스누즈 1회성 소비");
    }

    #[test]
    fn next_fire_one_shot_today_then_tomorrow() {
        let a = mk("a", 6, 30, vec![], true);
        // 현재 05:00 → 오늘 06:30.
        assert_eq!(
            next_fire_after(dt("2026-05-17 05:00"), &a),
            Some(dt("2026-05-17 06:30"))
        );
        // 현재 07:00 → 내일 06:30.
        assert_eq!(
            next_fire_after(dt("2026-05-17 07:00"), &a),
            Some(dt("2026-05-18 06:30"))
        );
    }

    #[test]
    fn next_fire_repeat_finds_next_matching_weekday() {
        // 2026-05-17 = 일요일(weekday0=6). repeat=[0(월)] → 다음 월(05-18).
        let a = mk("a", 6, 30, vec![0], true);
        assert_eq!(
            next_fire_after(dt("2026-05-17 08:00"), &a),
            Some(dt("2026-05-18 06:30"))
        );
    }

    #[test]
    fn next_fire_disabled_is_none() {
        let a = mk("a", 6, 30, vec![], false);
        assert_eq!(next_fire_after(dt("2026-05-17 05:00"), &a), None);
    }

    #[test]
    fn earliest_picks_soonest() {
        let alarms = vec![
            mk("late", 9, 0, vec![], true),
            mk("soon", 6, 30, vec![], true),
        ];
        assert_eq!(
            earliest_next_fire(&alarms, dt("2026-05-17 05:00")),
            Some(dt("2026-05-17 06:30"))
        );
    }

    #[test]
    fn validate_rejects_bad_input() {
        let mut a = mk("a", 25, 0, vec![], true);
        assert!(validate_alarm(&a).is_err());
        a.hour = 6;
        a.minute = 70;
        assert!(validate_alarm(&a).is_err());
        a.minute = 0;
        a.sound_path = Some("relative\\x.wav".into());
        assert!(validate_alarm(&a).is_err());
        a.sound_path = Some(r"C:\sounds\wake.wav".into());
        assert!(validate_alarm(&a).is_ok());
        a.sound_path = Some(r"C:\sounds\wake.mp3".into());
        assert!(validate_alarm(&a).is_err());
    }
}
