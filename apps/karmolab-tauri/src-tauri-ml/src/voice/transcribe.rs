//! sub-B-2 — candle whisper inference. pure Rust (whisper-rs 의 libclang.dll 의존 회피).
//!
//! candle-examples/examples/whisper/main.rs 패턴 차용 — 단순화:
//! - Quantized 폐기 (Normal only)
//! - 한국어 강제 (`<|ko|>` token, multilingual detection 폐기)
//! - timestamps=false / Task::Transcribe / verbose=false
//! - CLI 폐기 — `transcribe(&[f32]) -> Result<TranscribeResult>` 단일 entrypoint
//!
//! 모델: openai/whisper-large-v3 (HF mirror 자동 다운 + 캐시). large-v3 = 128 mel bins.
//! Decoder 영구 (`OnceLock<Mutex<Decoder>>`) — model/tokenizer load 1회.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::sync::atomic::{AtomicBool, Ordering};

use candle_core::{Device, IndexOp, Tensor};
use candle_nn::{ops::softmax, VarBuilder};
use candle_transformers::models::whisper::{self as m, audio, Config};
use rand::distr::weighted::WeightedIndex;
use rand::distr::Distribution;
use rand::SeedableRng;
use tokenizers::Tokenizer;

const MODEL_ID: &str = "openai/whisper-large-v3";
const MODEL_REVISION: &str = "main";
const HF_BASE: &str = "https://huggingface.co";
const SEED: u64 = 299_792_458;
const MODEL_FILES: &[&str] = &["config.json", "tokenizer.json", "model.safetensors"];

// sidecar IPC = text only (PROTOCOL Transcribed { text }). 원본 mod.rs 의
// segments(타임스탬프)는 메인이 안 씀 → 제거 (마이그 자기소멸). 필요 시
// PROTOCOL 에 segments 추가 후 부활.

#[derive(Debug, Clone, Copy)]
enum Task {
    Transcribe,
    #[allow(dead_code)]
    Translate,
}

struct DecodingResult {
    text: String,
    avg_logprob: f64,
    no_speech_prob: f64,
    #[allow(dead_code)]
    temperature: f64,
    #[allow(dead_code)]
    compression_ratio: f64,
}

/// candle whisper Whisper 모델 + tokenizer + suppress tokens + 언어/task 토큰 캐시.
struct Decoder {
    model: m::model::Whisper,
    rng: rand::rngs::StdRng,
    tokenizer: Tokenizer,
    config: Config,
    suppress_tokens: Tensor,
    sot_token: u32,
    transcribe_token: u32,
    eot_token: u32,
    no_speech_token: u32,
    no_timestamps_token: u32,
    language_token: u32,
    mel_filters: Vec<f32>,
    device: Device,
}

struct ModelFiles {
    config: PathBuf,
    tokenizer: PathBuf,
    weights: PathBuf,
}

/// 모델 캐시 디렉토리 = 메인이 `--model-dir` 로 주입한 경로
/// (`{memo_root}/life/.models/whisper-large-v3/` — 결정 #3, config 진실원=메인).
/// sidecar 는 LifeScreenConfig 를 모름 — 경로만 받아 ensure + 로드.
fn ensure_model_files(model_dir: &Path) -> Result<ModelFiles, String> {
    std::fs::create_dir_all(model_dir)
        .map_err(|e| format!("model cache 디렉토리 생성 실패: {e}"))?;
    let cache = model_dir.to_path_buf();
    let mut paths = Vec::with_capacity(MODEL_FILES.len());
    for name in MODEL_FILES {
        let dest = cache.join(name);
        if !dest.exists() {
            let url = format!("{HF_BASE}/{MODEL_ID}/resolve/{MODEL_REVISION}/{name}");
            download_with_progress(&url, &dest)?;
        }
        paths.push(dest);
    }
    Ok(ModelFiles {
        config: paths[0].clone(),
        tokenizer: paths[1].clone(),
        weights: paths[2].clone(),
    })
}

fn download_with_progress(url: &str, dest: &Path) -> Result<(), String> {
    eprintln!("[life-voice] 다운: {url}");
    let client = reqwest::blocking::Client::builder()
        .timeout(None)
        .build()
        .map_err(|e| format!("reqwest client 빌드 실패: {e}"))?;
    let mut resp = client
        .get(url)
        .send()
        .map_err(|e| format!("GET {url} 실패: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GET {url} status={}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    let partial = dest.with_file_name(format!(
        "{}.partial",
        dest.file_name().and_then(|n| n.to_str()).unwrap_or("part")
    ));
    let mut file =
        std::fs::File::create(&partial).map_err(|e| format!("partial 생성 실패: {e}"))?;
    let mut downloaded: u64 = 0;
    let mut last_pct: i64 = -1;
    let mut buf = vec![0u8; 1024 * 1024];
    use std::io::{Read, Write};
    loop {
        let n = resp
            .read(&mut buf)
            .map_err(|e| format!("download read 실패: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("download write 실패: {e}"))?;
        downloaded += n as u64;
        if total > 0 {
            let pct = (downloaded * 100 / total) as i64;
            if pct != last_pct && pct % 5 == 0 {
                eprintln!(
                    "[life-voice] 다운 {pct}% ({} / {} MB)",
                    downloaded / 1_048_576,
                    total / 1_048_576
                );
                last_pct = pct;
            }
        }
    }
    drop(file);
    std::fs::rename(&partial, dest)
        .map_err(|e| format!("partial → final rename 실패: {e}"))?;
    Ok(())
}

impl Decoder {
    fn new(device: Device, model_dir: &Path) -> Result<Self, String> {
        eprintln!("[life-voice] candle whisper 모델 다운/캐시 ({MODEL_ID})");
        let files = ensure_model_files(model_dir)?;
        let config_path = files.config;
        let tokenizer_path = files.tokenizer;
        let weights_path = files.weights;

        let config: Config = serde_json::from_str(
            &std::fs::read_to_string(&config_path)
                .map_err(|e| format!("config read 실패: {e}"))?,
        )
        .map_err(|e| format!("config parse 실패: {e}"))?;
        let tokenizer =
            Tokenizer::from_file(&tokenizer_path).map_err(|e| format!("tokenizer load 실패: {e}"))?;

        // mel filterbank — 80 또는 128 (large-v3 = 128).
        let mel_bytes: &[u8] = match config.num_mel_bins {
            80 => include_bytes!("melfilters.bytes").as_slice(),
            128 => include_bytes!("melfilters128.bytes").as_slice(),
            n => return Err(format!("unexpected num_mel_bins {n}")),
        };
        let mut mel_filters = vec![0f32; mel_bytes.len() / 4];
        <byteorder::LittleEndian as byteorder::ByteOrder>::read_f32_into(
            mel_bytes,
            &mut mel_filters,
        );

        eprintln!("[life-voice] candle whisper safetensors load");
        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[weights_path], m::DTYPE, &device)
                .map_err(|e| format!("VarBuilder 실패: {e}"))?
        };
        let model = m::model::Whisper::load(&vb, config.clone())
            .map_err(|e| format!("Whisper::load 실패: {e}"))?;

        let no_timestamps_token = token_id(&tokenizer, m::NO_TIMESTAMPS_TOKEN)?;
        let suppress_tokens: Vec<f32> = (0..config.vocab_size as u32)
            .map(|i| {
                if config.suppress_tokens.contains(&i) {
                    f32::NEG_INFINITY
                } else {
                    0f32
                }
            })
            .collect();
        let suppress_tokens = Tensor::new(suppress_tokens.as_slice(), &device)
            .map_err(|e| format!("suppress_tokens 실패: {e}"))?;
        let sot_token = token_id(&tokenizer, m::SOT_TOKEN)?;
        let transcribe_token = token_id(&tokenizer, m::TRANSCRIBE_TOKEN)?;
        let eot_token = token_id(&tokenizer, m::EOT_TOKEN)?;
        let no_speech_token = m::NO_SPEECH_TOKENS
            .iter()
            .find_map(|t| token_id(&tokenizer, t).ok())
            .ok_or_else(|| "no-speech token 미발견".to_string())?;
        let language_token = token_id(&tokenizer, "<|ko|>")?;

        eprintln!("[life-voice] candle whisper Decoder 준비 완료");
        Ok(Self {
            model,
            rng: rand::rngs::StdRng::seed_from_u64(SEED),
            tokenizer,
            config,
            suppress_tokens,
            sot_token,
            transcribe_token,
            eot_token,
            no_speech_token,
            no_timestamps_token,
            language_token,
            mel_filters,
            device,
        })
    }

    fn decode(&mut self, mel: &Tensor, t: f64) -> Result<DecodingResult, String> {
        let model = &mut self.model;
        let audio_features = model
            .encoder
            .forward(mel, true)
            .map_err(|e| format!("encoder_forward 실패: {e}"))?;
        let sample_len = self.config.max_target_positions / 2;
        let mut sum_logprob = 0f64;
        let mut no_speech_prob = f64::NAN;
        let mut tokens = vec![self.sot_token, self.language_token, self.transcribe_token];
        // timestamps=false → no_timestamps_token 박음.
        tokens.push(self.no_timestamps_token);

        for i in 0..sample_len {
            let tokens_t = Tensor::new(tokens.as_slice(), mel.device())
                .map_err(|e| format!("tokens tensor 실패: {e}"))?;
            let tokens_t = tokens_t
                .unsqueeze(0)
                .map_err(|e| format!("unsqueeze 실패: {e}"))?;
            let ys = model
                .decoder
                .forward(&tokens_t, &audio_features, i == 0)
                .map_err(|e| format!("decoder_forward 실패: {e}"))?;

            if i == 0 {
                let logits = model
                    .decoder
                    .final_linear(
                        &ys.i(..1).map_err(|e| format!("ys.i(..1) 실패: {e}"))?,
                    )
                    .map_err(|e| format!("final_linear 실패: {e}"))?
                    .i(0)
                    .map_err(|e| format!("logits.i(0) 실패: {e}"))?
                    .i(0)
                    .map_err(|e| format!("logits.i(0).i(0) 실패: {e}"))?;
                no_speech_prob = softmax(&logits, 0)
                    .map_err(|e| format!("softmax 실패: {e}"))?
                    .i(self.no_speech_token as usize)
                    .map_err(|e| format!("no_speech idx 실패: {e}"))?
                    .to_scalar::<f32>()
                    .map_err(|e| format!("no_speech scalar 실패: {e}"))? as f64;
            }

            let (_, seq_len, _) = ys.dims3().map_err(|e| format!("dims3 실패: {e}"))?;
            let logits = model
                .decoder
                .final_linear(
                    &ys.i((..1, seq_len - 1..))
                        .map_err(|e| format!("ys.i((..1, last)) 실패: {e}"))?,
                )
                .map_err(|e| format!("final_linear last 실패: {e}"))?
                .i(0)
                .map_err(|e| format!("logits last.i(0) 실패: {e}"))?
                .i(0)
                .map_err(|e| format!("logits last.i(0).i(0) 실패: {e}"))?;
            let logits = logits
                .broadcast_add(&self.suppress_tokens)
                .map_err(|e| format!("suppress add 실패: {e}"))?;
            let next_token = if t > 0f64 {
                let prs = softmax(
                    &(&logits / t).map_err(|e| format!("logits / t 실패: {e}"))?,
                    0,
                )
                .map_err(|e| format!("softmax sample 실패: {e}"))?;
                let logits_v: Vec<f32> = prs
                    .to_vec1()
                    .map_err(|e| format!("prs.to_vec1 실패: {e}"))?;
                let distr = WeightedIndex::new(&logits_v)
                    .map_err(|e| format!("WeightedIndex 실패: {e}"))?;
                distr.sample(&mut self.rng) as u32
            } else {
                let logits_v: Vec<f32> = logits
                    .to_vec1()
                    .map_err(|e| format!("logits.to_vec1 실패: {e}"))?;
                logits_v
                    .iter()
                    .enumerate()
                    .max_by(|(_, u), (_, v)| u.total_cmp(v))
                    .map(|(i, _)| i as u32)
                    .unwrap_or(self.eot_token)
            };
            tokens.push(next_token);
            let prob = softmax(&logits, candle_core::D::Minus1)
                .map_err(|e| format!("prob softmax 실패: {e}"))?
                .i(next_token as usize)
                .map_err(|e| format!("prob idx 실패: {e}"))?
                .to_scalar::<f32>()
                .map_err(|e| format!("prob scalar 실패: {e}"))? as f64;
            if next_token == self.eot_token || tokens.len() > self.config.max_target_positions {
                break;
            }
            sum_logprob += prob.ln();
        }
        let text = self
            .tokenizer
            .decode(&tokens, true)
            .map_err(|e| format!("tokenizer.decode 실패: {e}"))?;
        let avg_logprob = if tokens.is_empty() {
            f64::NEG_INFINITY
        } else {
            sum_logprob / tokens.len() as f64
        };

        let _ = Task::Transcribe; // marker (translate 폐기, 미래 분기 자리).

        Ok(DecodingResult {
            text,
            avg_logprob,
            no_speech_prob,
            temperature: t,
            compression_ratio: f64::NAN,
        })
    }

    fn decode_with_fallback(&mut self, segment: &Tensor) -> Result<DecodingResult, String> {
        for (i, &t) in m::TEMPERATURES.iter().enumerate() {
            let dr = self.decode(segment, t);
            if i == m::TEMPERATURES.len() - 1 {
                return dr;
            }
            match dr {
                Ok(dr) => {
                    let needs_fallback = dr.compression_ratio > m::COMPRESSION_RATIO_THRESHOLD
                        || dr.avg_logprob < m::LOGPROB_THRESHOLD;
                    if !needs_fallback || dr.no_speech_prob > m::NO_SPEECH_THRESHOLD {
                        return Ok(dr);
                    }
                }
                Err(err) => eprintln!("[life-voice] decode t={t} 실패: {err}"),
            }
        }
        unreachable!()
    }

    fn run_mel(&mut self, mel: &Tensor) -> Result<Vec<DecodingResult>, String> {
        let (_, _, content_frames) = mel.dims3().map_err(|e| format!("mel dims 실패: {e}"))?;
        let mut seek = 0;
        let mut results = vec![];
        eprintln!("[life-voice] transcribe run_mel: content_frames={content_frames}");
        while seek < content_frames {
            let segment_size = usize::min(content_frames - seek, m::N_FRAMES);
            let mel_segment = mel
                .narrow(2, seek, segment_size)
                .map_err(|e| format!("mel.narrow 실패: {e}"))?;
            let t0 = std::time::Instant::now();
            let dr = self.decode_with_fallback(&mel_segment)?;
            eprintln!(
                "[life-voice] transcribe segment seek={seek}/{content_frames} decode {:.1}s",
                t0.elapsed().as_secs_f32()
            );
            seek += segment_size;
            if dr.no_speech_prob > m::NO_SPEECH_THRESHOLD && dr.avg_logprob < m::LOGPROB_THRESHOLD {
                eprintln!("[life-voice] no speech detected, skip seek={seek}");
                continue;
            }
            results.push(dr);
        }
        Ok(results)
    }
}

fn token_id(tokenizer: &Tokenizer, token: &str) -> Result<u32, String> {
    tokenizer
        .token_to_id(token)
        .ok_or_else(|| format!("token id 미발견: {token}"))
}

static DECODER_CELL: OnceLock<Arc<Mutex<Option<Decoder>>>> = OnceLock::new();
static DECODER_LOADING: AtomicBool = AtomicBool::new(false);

fn decoder_arc() -> &'static Arc<Mutex<Option<Decoder>>> {
    DECODER_CELL.get_or_init(|| Arc::new(Mutex::new(None)))
}

pub fn is_loaded() -> bool {
    decoder_arc().lock().map(|g| g.is_some()).unwrap_or(false)
}

pub fn is_loading() -> bool {
    DECODER_LOADING.load(Ordering::Relaxed)
}

/// 백그라운드 thread 에서 모델 로드. 이미 로드 중이거나 완료면 no-op.
pub fn load(model_dir: PathBuf) -> Result<(), String> {
    if is_loaded() || DECODER_LOADING.load(Ordering::SeqCst) {
        return Ok(());
    }
    DECODER_LOADING.store(true, Ordering::SeqCst);
    let arc = decoder_arc().clone();
    std::thread::Builder::new()
        .name("life-voice-decoder-load".into())
        .spawn(move || {
            eprintln!("[life-voice] decoder load 시작 (~3.1GB)");
            match Decoder::new(Device::Cpu, &model_dir) {
                Ok(dec) => {
                    let mut g = arc.lock().unwrap();
                    *g = Some(dec);
                    drop(g);
                    DECODER_LOADING.store(false, Ordering::SeqCst);
                    eprintln!("[life-voice] decoder load 완료");
                }
                Err(e) => {
                    DECODER_LOADING.store(false, Ordering::SeqCst);
                    eprintln!("[life-voice] decoder load 실패: {e}");
                }
            }
        })
        .map_err(|e| {
            DECODER_LOADING.store(false, Ordering::SeqCst);
            format!("decoder load thread spawn 실패: {e}")
        })?;
    Ok(())
}

/// 모델을 메모리에서 해제 (~3.1GB 반환). 진행 중인 transcribe 완료 후 실행.
pub fn unload() {
    if let Ok(mut g) = decoder_arc().lock() {
        *g = None;
        eprintln!("[life-voice] decoder unload 완료");
    }
}

pub fn transcribe(samples_16k: &[f32]) -> Result<String, String> {
    if samples_16k.is_empty() {
        return Ok(String::new());
    }
    let arc = decoder_arc();
    let mut guard = arc.lock().map_err(|e| format!("decoder mutex: {e}"))?;
    let dec = guard.as_mut()
        .ok_or_else(|| "voice 기능 비활성 — Life 위젯에서 먼저 활성화".to_string())?;

    let mel_filters = dec.mel_filters.clone();
    let mel = audio::pcm_to_mel(&dec.config, samples_16k, &mel_filters);
    let mel_len = mel.len();
    let num_mel_bins = dec.config.num_mel_bins;
    let mel = Tensor::from_vec(
        mel,
        (1, num_mel_bins, mel_len / num_mel_bins),
        &dec.device,
    )
    .map_err(|e| format!("mel Tensor::from_vec 실패: {e}"))?;

    let results = dec.run_mel(&mel)?;
    let mut full_text = String::new();
    for dr in results {
        full_text.push_str(dr.text.trim());
        full_text.push(' ');
    }
    Ok(full_text.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_samples_returns_empty_result() {
        let r = transcribe(&[]).expect("빈 샘플 OK");
        assert!(r.is_empty());
    }
}
