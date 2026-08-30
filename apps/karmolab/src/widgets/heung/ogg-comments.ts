/**
 * OGG 파일의 루프 지점 주석.
 *
 * 게임 쪽 표준은 Vorbis 주석의 LOOPSTART, LOOPLENGTH 두 줄. 단위는 초가 아니라 **표본**.
 * 인코더는 자기 주석만 쓰고 나가므로 나중에 끼워야 하고, 끼우면 그 페이지의 조각표와
 * CRC 를 다시 엮어야 한다. 숫자 하나만 어긋나면 재생기가 파일을 통째로 버림.
 *
 * 다루는 것은 바이트뿐. 브라우저도 오디오도 모름.
 */

/** Ogg 페이지 하나. data 는 조각들을 이어 붙인 것 */
export interface OggPage {
  start: number;
  end: number;
  headerType: number;
  granule: bigint;
  serial: number;
  sequence: number;
  segments: number[];
  body: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index << 24;
    for (let bit = 0; bit < 8; bit++) value = value & 0x80000000 ? ((value << 1) ^ 0x04c11db7) >>> 0 : (value << 1) >>> 0;
    table[index] = value >>> 0;
  }
  return table;
})();

/** Ogg 의 CRC32. 흔한 CRC 와 달리 앞뒤 뒤집기 없음 */
export function oggCrc32(bytes: Uint8Array): number {
  let crc = 0;
  for (let index = 0; index < bytes.length; index++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ bytes[index]) & 0xff]) >>> 0;
  return crc >>> 0;
}

/** 페이지 목록. 깨진 자리에서 멈춤 */
export function readOggPages(bytes: Uint8Array): OggPage[] {
  const pages: OggPage[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  while (at + 27 <= bytes.length) {
    if (bytes[at] !== 0x4f || bytes[at + 1] !== 0x67 || bytes[at + 2] !== 0x67 || bytes[at + 3] !== 0x53) break;
    const count = bytes[at + 26];
    const tableAt = at + 27;
    if (tableAt + count > bytes.length) break;
    const segments: number[] = [];
    let bodyLength = 0;
    for (let index = 0; index < count; index++) { const size = bytes[tableAt + index]; segments.push(size); bodyLength += size; }
    const bodyAt = tableAt + count;
    if (bodyAt + bodyLength > bytes.length) break;
    pages.push({
      start: at, end: bodyAt + bodyLength,
      headerType: bytes[at + 5],
      granule: view.getBigUint64(at + 6, true),
      serial: view.getUint32(at + 14, true),
      sequence: view.getUint32(at + 18, true),
      segments,
      body: bytes.subarray(bodyAt, bodyAt + bodyLength)
    });
    at = bodyAt + bodyLength;
  }
  return pages;
}

/** 조각표를 따라 패킷 가르기. 255 로 끝나면 다음 조각으로 이어짐 */
export function splitPackets(page: OggPage): Uint8Array[] {
  const packets: Uint8Array[] = [];
  let at = 0;
  let length = 0;
  for (const size of page.segments) {
    length += size;
    if (size < 255) { packets.push(page.body.subarray(at, at + length)); at += length; length = 0; }
  }
  if (length) packets.push(page.body.subarray(at, at + length));
  return packets;
}

function encodeText(text: string): Uint8Array {
  const out: number[] = [];
  for (const point of text) {
    const code = point.codePointAt(0) ?? 0;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return Uint8Array.from(out);
}

/** 주석 패킷 다시 엮기. 앞머리 7바이트와 vendor 는 그대로, 줄만 추가 */
export function rebuildCommentPacket(packet: Uint8Array, extra: Record<string, string>): Uint8Array | null {
  if (packet.length < 11 || packet[0] !== 3) return null;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const vendorLength = view.getUint32(7, true);
  let at = 11 + vendorLength;
  if (at + 4 > packet.length) return null;
  const count = view.getUint32(at, true);
  at += 4;
  const lines: Uint8Array[] = [];
  for (let index = 0; index < count; index++) {
    if (at + 4 > packet.length) return null;
    const size = view.getUint32(at, true);
    at += 4;
    if (at + size > packet.length) return null;
    lines.push(packet.subarray(at, at + size));
    at += size;
  }
  for (const [key, value] of Object.entries(extra)) lines.push(encodeText(`${key}=${value}`));
  let size = 11 + vendorLength + 4;
  for (const line of lines) size += 4 + line.length;
  size += 1;
  const out = new Uint8Array(size);
  const outView = new DataView(out.buffer);
  out.set(packet.subarray(0, 11 + vendorLength), 0);
  let write = 11 + vendorLength;
  outView.setUint32(write, lines.length, true); write += 4;
  for (const line of lines) { outView.setUint32(write, line.length, true); write += 4; out.set(line, write); write += line.length; }
  out[write] = 1;
  return out;
}

function buildPage(page: OggPage, packets: Uint8Array[]): Uint8Array | null {
  const segments: number[] = [];
  for (const packet of packets) {
    let left = packet.length;
    while (left >= 255) { segments.push(255); left -= 255; }
    segments.push(left);
  }
  if (segments.length > 255) return null;
  let bodyLength = 0;
  for (const packet of packets) bodyLength += packet.length;
  const out = new Uint8Array(27 + segments.length + bodyLength);
  const view = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53, 0], 0);
  out[5] = page.headerType;
  view.setBigUint64(6, page.granule, true);
  view.setUint32(14, page.serial, true);
  view.setUint32(18, page.sequence, true);
  view.setUint32(22, 0, true);
  out[26] = segments.length;
  for (let index = 0; index < segments.length; index++) out[27 + index] = segments[index];
  let write = 27 + segments.length;
  for (const packet of packets) { out.set(packet, write); write += packet.length; }
  view.setUint32(22, oggCrc32(out), true);
  return out;
}

/**
 * 루프 지점을 끼운 새 바이트. 못 끼우면 원본 그대로.
 *
 * 조각표가 255 를 넘으면 페이지를 갈라야 하는데 그건 안 함. 대신 원본 유지.
 */
export function injectVorbisComments(bytes: Uint8Array, extra: Record<string, string>): { bytes: Uint8Array; injected: boolean } {
  const pages = readOggPages(bytes);
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const packets = splitPackets(page);
    const commentAt = packets.findIndex((packet) => packet.length > 6 && packet[0] === 3 && packet[1] === 0x76 && packet[2] === 0x6f && packet[3] === 0x72);
    if (commentAt < 0) continue;
    const rebuilt = rebuildCommentPacket(packets[commentAt], extra);
    if (!rebuilt) return { bytes, injected: false };
    const next = packets.slice();
    next[commentAt] = rebuilt;
    const pageBytes = buildPage(page, next);
    if (!pageBytes) return { bytes, injected: false };
    const out = new Uint8Array(bytes.length - (page.end - page.start) + pageBytes.length);
    out.set(bytes.subarray(0, page.start), 0);
    out.set(pageBytes, page.start);
    out.set(bytes.subarray(page.end), page.start + pageBytes.length);
    return { bytes: out, injected: true };
  }
  return { bytes, injected: false };
}
