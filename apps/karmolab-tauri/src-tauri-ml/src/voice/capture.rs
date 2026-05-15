//! sub-B-2 — cpal audio capture (16kHz mono float32). cross-platform (WASAPI/CoreAudio/ALSA).
//!
//! cpal `Stream` 가 Windows 에서 `!Send + !Sync` (cpal 0.15 `NotSendSyncAcrossAllPlatforms`) 라
//! dedicated audio thread + channel pattern 으로 우회. `Recorder` 자체는 Send + Sync —
//! `OnceLock<Recorder>` static 으로 보유 가능.
//!
//! `Recorder::start()` → audio thread 에 `Cmd::Start` send (stream open).
//! `Recorder::stop()` → audio thread 에 `Cmd::Stop` send + frames `Vec<f32>` recv (16kHz resampled).

use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

pub const TARGET_SAMPLE_RATE: u32 = 16_000;

enum Cmd {
    Start,
    Stop,
}

pub struct Recorder {
    cmd_tx: Mutex<Sender<Cmd>>,
    result_rx: Mutex<Receiver<Vec<f32>>>,
}

impl Recorder {
    pub fn new() -> Result<Self, String> {
        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let (result_tx, result_rx) = mpsc::channel::<Vec<f32>>();
        std::thread::Builder::new()
            .name("life-voice-audio".into())
            .spawn(move || audio_thread_loop(cmd_rx, result_tx))
            .map_err(|e| format!("audio thread spawn 실패: {e}"))?;
        Ok(Self {
            cmd_tx: Mutex::new(cmd_tx),
            result_rx: Mutex::new(result_rx),
        })
    }

    pub fn start(&self) -> Result<(), String> {
        let tx = self.cmd_tx.lock().map_err(|e| format!("cmd_tx mutex: {e}"))?;
        tx.send(Cmd::Start)
            .map_err(|e| format!("Cmd::Start send 실패 (audio thread 종료?): {e}"))
    }

    pub fn stop(&self) -> Option<Vec<f32>> {
        let tx = self.cmd_tx.lock().ok()?;
        tx.send(Cmd::Stop).ok()?;
        drop(tx);
        let rx = self.result_rx.lock().ok()?;
        rx.recv_timeout(Duration::from_secs(5)).ok()
    }
}

fn audio_thread_loop(cmd_rx: Receiver<Cmd>, result_tx: Sender<Vec<f32>>) {
    let host = cpal::default_host();
    let device = match host.default_input_device() {
        Some(d) => d,
        None => {
            eprintln!("[life-voice-audio] 기본 입력 장치 없음 — audio thread 종료");
            return;
        }
    };

    let frames: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let mut stream: Option<cpal::Stream> = None;
    let mut actual_sample_rate: u32 = TARGET_SAMPLE_RATE;

    while let Ok(cmd) = cmd_rx.recv() {
        match cmd {
            Cmd::Start => {
                if stream.is_some() {
                    continue;
                }
                // 새 record 시작 — frames buffer 초기화.
                if let Ok(mut g) = frames.lock() {
                    g.clear();
                }
                match build_input_stream(&device, frames.clone()) {
                    Ok((s, rate)) => {
                        if let Err(e) = s.play() {
                            eprintln!("[life-voice-audio] stream.play 실패: {e}");
                            continue;
                        }
                        stream = Some(s);
                        actual_sample_rate = rate;
                    }
                    Err(e) => eprintln!("[life-voice-audio] stream build 실패: {e}"),
                }
            }
            Cmd::Stop => {
                if let Some(s) = stream.take() {
                    let _ = s.pause();
                    drop(s);
                }
                let raw = match frames.lock() {
                    Ok(mut g) => std::mem::take(&mut *g),
                    Err(_) => Vec::new(),
                };
                let resampled = if actual_sample_rate == TARGET_SAMPLE_RATE {
                    raw
                } else {
                    linear_resample(&raw, actual_sample_rate, TARGET_SAMPLE_RATE)
                };
                let _ = result_tx.send(resampled);
            }
        }
    }
}

fn build_input_stream(
    device: &cpal::Device,
    frames: Arc<Mutex<Vec<f32>>>,
) -> Result<(cpal::Stream, u32), String> {
    let supported = device
        .default_input_config()
        .map_err(|e| format!("default_input_config 실패: {e}"))?;
    let actual_rate = supported.sample_rate().0;
    let channels = supported.channels();
    let config = cpal::StreamConfig {
        channels,
        sample_rate: cpal::SampleRate(actual_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    let frames_cb_f32 = frames.clone();
    let frames_cb_i16 = frames.clone();
    let frames_cb_u16 = frames;

    let stream = match supported.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config,
            move |data: &[f32], _info| {
                let mono = downmix_to_mono(data, channels as usize);
                if let Ok(mut g) = frames_cb_f32.lock() {
                    g.extend_from_slice(&mono);
                }
            },
            |err| eprintln!("[life-voice-audio] stream err: {err}"),
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config,
            move |data: &[i16], _info| {
                let f32_buf: Vec<f32> = data.iter().map(|s| *s as f32 / i16::MAX as f32).collect();
                let mono = downmix_to_mono(&f32_buf, channels as usize);
                if let Ok(mut g) = frames_cb_i16.lock() {
                    g.extend_from_slice(&mono);
                }
            },
            |err| eprintln!("[life-voice-audio] stream err: {err}"),
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &config,
            move |data: &[u16], _info| {
                let f32_buf: Vec<f32> = data
                    .iter()
                    .map(|s| (*s as f32 - 32_768.0) / 32_768.0)
                    .collect();
                let mono = downmix_to_mono(&f32_buf, channels as usize);
                if let Ok(mut g) = frames_cb_u16.lock() {
                    g.extend_from_slice(&mono);
                }
            },
            |err| eprintln!("[life-voice-audio] stream err: {err}"),
            None,
        ),
        other => return Err(format!("지원 안 되는 sample format: {other:?}")),
    }
    .map_err(|e| format!("build_input_stream 실패: {e}"))?;

    Ok((stream, actual_rate))
}

/// 다채널 → mono (평균). 1ch 이면 원본 그대로.
fn downmix_to_mono(samples: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    samples
        .chunks(channels)
        .map(|c| c.iter().sum::<f32>() / c.len() as f32)
        .collect()
}

/// linear interpolation resample. whisper 입력 = 16kHz 강제.
fn linear_resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate {
        return samples.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = (samples.len() as f64 / ratio).round() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src = i as f64 * ratio;
        let lo = src.floor() as usize;
        let hi = (lo + 1).min(samples.len().saturating_sub(1));
        let frac = (src - lo as f64) as f32;
        let lo_v = samples[lo.min(samples.len().saturating_sub(1))];
        let hi_v = samples[hi];
        out.push(lo_v + (hi_v - lo_v) * frac);
    }
    out
}

/// f32 mono → PCM_16 .wav file 저장 (sub-B Python schema 정합).
pub fn write_wav_pcm16(path: &std::path::Path, samples: &[f32]) -> Result<(), String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec)
        .map_err(|e| format!("wav writer create 실패: {e}"))?;
    for s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let i = (clamped * i16::MAX as f32) as i16;
        writer
            .write_sample(i)
            .map_err(|e| format!("wav write 실패: {e}"))?;
    }
    writer.finalize().map_err(|e| format!("wav finalize 실패: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downmix_stereo_to_mono_average() {
        let stereo: Vec<f32> = vec![1.0, -1.0, 0.5, 0.5, 0.0, 1.0];
        let mono = downmix_to_mono(&stereo, 2);
        assert_eq!(mono, vec![0.0, 0.5, 0.5]);
    }

    #[test]
    fn downmix_mono_passthrough() {
        let mono: Vec<f32> = vec![0.1, 0.2, 0.3];
        assert_eq!(downmix_to_mono(&mono, 1), mono);
    }

    #[test]
    fn linear_resample_2x_downsample_halves() {
        let samples: Vec<f32> = (0..16).map(|i| i as f32).collect();
        let out = linear_resample(&samples, 32_000, 16_000);
        assert_eq!(out.len(), 8);
        assert!((out[0] - 0.0).abs() < 0.01);
    }

    #[test]
    fn linear_resample_same_rate_passthrough() {
        let samples: Vec<f32> = vec![0.1, 0.2, 0.3];
        let out = linear_resample(&samples, 16_000, 16_000);
        assert_eq!(out, samples);
    }

    #[test]
    fn write_wav_creates_valid_file() {
        let tmp = std::env::temp_dir().join(format!(
            "voice-wav-{}.wav",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let samples: Vec<f32> = (0..1600).map(|i| (i as f32 / 1600.0).sin()).collect();
        write_wav_pcm16(&tmp, &samples).expect("wav write 실패");
        assert!(tmp.exists());
        let reader = hound::WavReader::open(&tmp).expect("wav read 실패");
        assert_eq!(reader.spec().channels, 1);
        assert_eq!(reader.spec().sample_rate, TARGET_SAMPLE_RATE);
        let _ = std::fs::remove_file(&tmp);
    }
}
