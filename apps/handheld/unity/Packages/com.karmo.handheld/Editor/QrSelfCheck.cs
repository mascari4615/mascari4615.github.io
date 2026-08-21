using System;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace Handheld.EditorTools
{
    /// <summary>
    /// QR 인코더를 다른 구현과 대조하려고 모듈 행렬을 텍스트로 뽑는다.
    /// 표를 손으로 옮겨 적은 코드라 「스캔되는 것 같다」로 끝내지 않는다. TASK-KAR-230.
    ///
    /// 배치: -executeMethod Handheld.EditorTools.QrSelfCheck.DumpBatch
    ///       (대상 문자열은 환경변수 HANDHELD_QR_TEXT, 없으면 기본값)
    /// </summary>
    public static class QrSelfCheck
    {
        public static void DumpBatch()
        {
            string one = Environment.GetEnvironmentVariable("HANDHELD_QR_TEXT");
            string[] texts = string.IsNullOrEmpty(one)
                ? new[]
                  {
                      "https://anne-careful-supposed-nickel.trycloudflare.com",
                      "https://a.co",
                      "http://192.168.0.2:8842/",
                      "https://dir-everywhere-constraints-encourage.trycloudflare.com/index.html?k=7f3a",
                  }
                : new[] { one };

            string outPath = Environment.GetEnvironmentVariable("HANDHELD_QR_OUT");
            if (string.IsNullOrEmpty(outPath)) outPath = "qr-dump.txt";

            var sb = new StringBuilder();
            foreach (string text in texts)
            {
                foreach (QrCode.Ecc ecc in new[] { QrCode.Ecc.Low, QrCode.Ecc.Medium })
                {
                    bool[,] m = QrCode.Encode(text, ecc);
                    if (m == null) { sb.AppendLine($"# {ecc} FAILED"); continue; }
                    int n = m.GetLength(0);
                    sb.AppendLine($"# ecc={ecc} size={n} text={text}");
                    for (int y = 0; y < n; y++)
                    {
                        var row = new char[n];
                        for (int x = 0; x < n; x++) row[x] = m[y, x] ? '1' : '0';
                        sb.AppendLine(new string(row));
                    }
                }
            }

            File.WriteAllText(outPath, sb.ToString());
            Debug.Log($"[QrSelfCheck] 썼다: {Path.GetFullPath(outPath)}");
            EditorApplication.Exit(0);
        }
    }
}
