/** 공개 강의 벡터의 갈래 평균. 화면 좌표와 독립적인 검증 자료 */
export function trackMeaning(tracks, vectors) {
  return Object.fromEntries(tracks.map((track) => {
    const rows = track.stages.flatMap((stage) => stage.nodes.map((node) => vectors[node.id]));
    const dim = rows[0]?.length;
    if (!dim || rows.some((row) => row?.length !== dim || row.some((v) => !Number.isFinite(v)))) {
      throw new Error(`강의 의미 벡터 누락 또는 손상: ${track.id}`);
    }
    const sum = new Float64Array(dim);
    for (const row of rows) for (let i = 0; i < dim; i++) sum[i] += row[i];
    return [track.id, Array.from(sum, (v) => v / rows.length)];
  }));
}
