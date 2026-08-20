using System;
using System.IO;
using System.Net.WebSockets;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace Handheld.EditorTools
{
    /// <summary>
    /// 「.NET 에 이미 웹소켓 서버가 있지 않나」를 말로 답하지 않고 이 런타임에서 직접 재 본다.
    /// -executeMethod Handheld.EditorTools.WsApiProbe.Run    (TASK-KAR-230)
    /// </summary>
    public static class WsApiProbe
    {
        public static void Run()
        {
            var log = new System.Text.StringBuilder();
            void W(string s) { log.AppendLine(s); Debug.Log("[WsProbe] " + s); }

            W($"런타임: {System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription}");

            // ① WebSocket.CreateFromStream — 핸드셰이크 뒤 프레이밍만 맡기는 API
            var m = typeof(WebSocket).GetMethod("CreateFromStream",
                BindingFlags.Public | BindingFlags.Static);
            W($"WebSocket.CreateFromStream 존재: {m != null}");
            if (m != null)
            {
                try
                {
                    using (var ms = new MemoryStream())
                    {
                        var sock = WebSocket.CreateFromStream(ms, true, null, TimeSpan.FromSeconds(30));
                        W($"  → 실제 호출 성공: {sock.GetType().FullName}");
                        sock.Dispose();
                    }
                }
                catch (Exception e)
                {
                    W($"  → 호출 실패: {e.GetType().Name}: {e.Message}");
                }
            }

            // ② HttpListener 쪽 — 핸드셰이크까지 해 주는 길
            var hl = Type.GetType("System.Net.HttpListenerContext, System") ??
                     Type.GetType("System.Net.HttpListenerContext, System.Net.HttpListener");
            W($"HttpListenerContext 타입: {(hl == null ? "없음" : hl.AssemblyQualifiedName)}");
            if (hl != null)
            {
                var accept = hl.GetMethod("AcceptWebSocketAsync", new[] { typeof(string) });
                W($"  AcceptWebSocketAsync(string) 존재: {accept != null}");
            }

            // ③ 우리가 쓰는 것들이 이 런타임에 있나 (대조군)
            W($"System.Net.Sockets.TcpListener 존재: {typeof(System.Net.Sockets.TcpListener) != null}");

            string outPath = Environment.GetEnvironmentVariable("HANDHELD_PROBE_OUT");
            if (!string.IsNullOrEmpty(outPath)) File.WriteAllText(outPath, log.ToString());
            EditorApplication.Exit(0);
        }
    }
}
