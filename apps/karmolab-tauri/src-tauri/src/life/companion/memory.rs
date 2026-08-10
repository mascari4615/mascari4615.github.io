//! sub-G — long-term log (`<memo>/life/companion/log/<date>.md`) 에서 최근 N entries 읽기.
//!
//! 형식 (output.rs 와 정합):
//! ```text
//! # <date> — companion log
//!
//! ## <timestamp> [<persona-id>]
//!
//! <response>
//!
//! <small>...</small>
//! ```

use std::fs;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct RecentEntry {
    pub timestamp: String,
    pub persona: String,
    pub response: String,
}

pub fn recent_entries(companion_root: &Path, n: usize) -> Vec<RecentEntry> {
    let log_dir = companion_root.join("log");
    if !log_dir.is_dir() {
        return Vec::new();
    }

    let mut files: Vec<_> = match fs::read_dir(&log_dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("md"))
            .collect(),
        Err(_) => return Vec::new(),
    };
    files.sort();
    files.reverse();

    let mut out = Vec::new();
    for path in files {
        let body = match fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let mut chunks: Vec<&str> = body.split("\n## ").collect();
        if chunks.len() <= 1 {
            continue;
        }
        // chunks[0] = 파일 헤더 (`# <date> ...`). entries = chunks[1..].
        chunks.remove(0);
        for chunk in chunks.into_iter().rev() {
            if let Some(entry) = parse_entry(chunk) {
                out.push(entry);
                if out.len() >= n {
                    return out;
                }
            }
        }
    }
    out
}

fn parse_entry(chunk: &str) -> Option<RecentEntry> {
    let (header, body) = chunk.split_once('\n')?;
    let header = header.trim();
    // 형식: "<timestamp> [<persona-id>]"
    let bracket_start = header.rfind(" [")?;
    let after = &header[bracket_start + 2..];
    let persona = after.trim_end_matches(']').to_string();
    let timestamp = header[..bracket_start].trim().to_string();

    // body 에서 "<small>" 줄 제외.
    let response: String = body
        .lines()
        .filter(|l| !l.trim_start().starts_with("<small>"))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    if response.is_empty() {
        return None;
    }
    Some(RecentEntry {
        timestamp,
        persona,
        response,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_simple_entry() {
        let chunk = "2026-05-10 12:34:56 [ring]\n\n오 이거 뭐야?\n\n<small>screenshot: x.png</small>\n";
        let e = parse_entry(chunk).unwrap();
        assert_eq!(e.timestamp, "2026-05-10 12:34:56");
        assert_eq!(e.persona, "ring");
        assert_eq!(e.response, "오 이거 뭐야?");
    }

    #[test]
    fn recent_reads_latest_first() {
        let tmp = std::env::temp_dir().join(format!(
            "life-companion-recent-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let log = tmp.join("log");
        std::fs::create_dir_all(&log).unwrap();

        std::fs::write(
            log.join("2026-05-09.md"),
            "# 2026-05-09\n\n## 2026-05-09 10:00:00 [yon]\n\n어제 거.\n",
        )
        .unwrap();
        std::fs::write(
            log.join("2026-05-10.md"),
            "# 2026-05-10\n\n## 2026-05-10 12:00:00 [ring]\n\n첫 번째.\n\n## 2026-05-10 13:00:00 [alisa]\n\n둘 번째.\n",
        )
        .unwrap();

        let entries = recent_entries(&tmp, 5);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].timestamp, "2026-05-10 13:00:00");
        assert_eq!(entries[0].persona, "alisa");
        assert_eq!(entries[1].persona, "ring");
        assert_eq!(entries[2].persona, "yon");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
