using System;
using System.Collections.Concurrent;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace Handheld
{
    /// <summary>
    /// 서버 쪽 WebSocket 연결 한 개.
    ///
    /// **프레이밍은 런타임에 맡긴다** — `WebSocket.CreateFromStream(isServer: true)` 이 마스킹·
    /// 길이 필드·연속 프레임(opcode 0x0)·ping/pong 을 다 처리한다. 손으로 짠 파서는 작은
    /// 메시지에서만 맞고 **쪼개진 메시지를 조용히 버리는** 구멍이 있었다 (2026-08-20 교체).
    ///
    /// 우리가 직접 하는 건 **HTTP 101 핸드셰이크뿐**이다 — CreateFromStream 은 업그레이드가
    /// 끝난 스트림을 받는 API 라 그 앞단은 여전히 서버 몫이다.
    /// TASK-KAR-230.
    /// </summary>
    public sealed class WsConnection : IDisposable
    {
        const string WsGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

        readonly TcpClient _tcp;
        readonly NetworkStream _stream;
        readonly WebSocket _socket;
        readonly Thread _recvThread;
        readonly Thread _sendThread;
        readonly BlockingCollection<Frame> _sendQueue =
            new BlockingCollection<Frame>(new ConcurrentQueue<Frame>());
        readonly CancellationTokenSource _cts = new CancellationTokenSource();

        /// <summary>큐가 이만큼 밀리면 오래된 프레임을 버린다 (지연 누적 방지).</summary>
        public int MaxQueuedFrames = 2;

        volatile bool _closed;
        public bool Closed => _closed || _socket.State != WebSocketState.Open;

        /// <summary>텍스트 메시지 수신 콜백 (수신 스레드에서 호출).</summary>
        public Action<string> OnText;
        public Action<string> OnLog;

        struct Frame
        {
            public byte[] Data;
            public WebSocketMessageType Type;
        }

        WsConnection(TcpClient tcp, WebSocket socket)
        {
            _tcp = tcp;
            _tcp.NoDelay = true;
            _stream = tcp.GetStream();
            _socket = socket;
            _recvThread = new Thread(RecvLoop) { IsBackground = true, Name = "ws-recv" };
            _sendThread = new Thread(SendLoop) { IsBackground = true, Name = "ws-send" };
        }

        /// <summary>
        /// 이미 읽힌 HTTP 요청 헤더로 핸드셰이크를 마치고 연결을 연다. 실패하면 null.
        /// </summary>
        public static WsConnection Accept(TcpClient tcp, string requestHeaders)
        {
            string key = HttpUtil.HeaderValue(requestHeaders, "Sec-WebSocket-Key");
            if (string.IsNullOrEmpty(key)) return null;

            // 규격이 정한 고정 GUID 를 붙여 SHA-1 → Base64. 암호가 아니라 「이 프로토콜을 아는
            // 서버다」라는 증명이다 — 중간의 캐시·프록시가 우연히 만들어낼 수 없다.
            string accept;
            using (var sha1 = SHA1.Create())
                accept = Convert.ToBase64String(sha1.ComputeHash(Encoding.ASCII.GetBytes(key + WsGuid)));

            var resp = Encoding.ASCII.GetBytes(
                "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "Sec-WebSocket-Accept: " + accept + "\r\n\r\n");

            var stream = tcp.GetStream();
            stream.Write(resp, 0, resp.Length);
            stream.Flush();

            // 여기서부터 이 스트림은 더 이상 HTTP 가 아니다 — 프레이밍은 런타임이 맡는다.
            var socket = WebSocket.CreateFromStream(stream, isServer: true, subProtocol: null,
                keepAliveInterval: TimeSpan.FromSeconds(30));

            var conn = new WsConnection(tcp, socket);
            conn._recvThread.Start();
            conn._sendThread.Start();
            return conn;
        }

        /// <summary>바이너리 프레임 전송 요청. 큐가 밀려 있으면 오래된 것을 버린다.</summary>
        public void SendBinary(byte[] payload)
        {
            if (Closed) return;
            while (_sendQueue.Count >= MaxQueuedFrames && _sendQueue.TryTake(out _)) { }
            Enqueue(payload, WebSocketMessageType.Binary);
        }

        public void SendText(string text)
        {
            if (Closed) return;
            Enqueue(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text);
        }

        void Enqueue(byte[] data, WebSocketMessageType type)
        {
            try { _sendQueue.Add(new Frame { Data = data, Type = type }); }
            catch (InvalidOperationException) { /* 닫히는 중 */ }
        }

        void SendLoop()
        {
            try
            {
                // WebSocket 은 동시 송신 하나만 허용한다 — 이 스레드가 유일한 송신자다.
                foreach (var frame in _sendQueue.GetConsumingEnumerable(_cts.Token))
                {
                    if (Closed) break;
                    _socket.SendAsync(new ArraySegment<byte>(frame.Data), frame.Type,
                        endOfMessage: true, cancellationToken: _cts.Token)
                        .GetAwaiter().GetResult();
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception e) { OnLog?.Invoke("ws send 끝: " + e.Message); }
            finally { Close(); }
        }

        void RecvLoop()
        {
            var buffer = new byte[8 * 1024];
            var message = new MemoryStreamLite();
            try
            {
                while (!_closed && _socket.State == WebSocketState.Open)
                {
                    WebSocketReceiveResult result;
                    try
                    {
                        result = _socket.ReceiveAsync(new ArraySegment<byte>(buffer), _cts.Token)
                            .GetAwaiter().GetResult();
                    }
                    catch (OperationCanceledException) { break; }

                    if (result.MessageType == WebSocketMessageType.Close) break;

                    message.Write(buffer, result.Count);

                    // 쪼개져 온 메시지는 끝 조각이 올 때까지 이어 붙인다 — 직접 짠 파서가
                    // 놓쳤던 부분이다.
                    if (!result.EndOfMessage)
                    {
                        if (message.Length > 4 * 1024 * 1024) break;   // 폰이 보내는 건 작다
                        continue;
                    }

                    if (result.MessageType == WebSocketMessageType.Text && OnText != null)
                        OnText(Encoding.UTF8.GetString(message.Buffer, 0, message.Length));

                    message.Reset();
                }
            }
            catch (Exception e) { OnLog?.Invoke("ws recv 끝: " + e.Message); }
            finally { Close(); }
        }

        public void Close()
        {
            if (_closed) return;
            _closed = true;
            try { _sendQueue.CompleteAdding(); } catch { }
            try { _cts.Cancel(); } catch { }
            try { _socket.Abort(); } catch { }
            try { _socket.Dispose(); } catch { }
            try { _stream.Close(); } catch { }
            try { _tcp.Close(); } catch { }
            try { _cts.Dispose(); } catch { }
        }

        public void Dispose() => Close();

        /// <summary>조각을 이어 붙이는 최소 버퍼 — 매 프레임 할당을 피한다.</summary>
        sealed class MemoryStreamLite
        {
            public byte[] Buffer = new byte[8 * 1024];
            public int Length;

            public void Write(byte[] src, int count)
            {
                if (Length + count > Buffer.Length)
                    Array.Resize(ref Buffer, Math.Max(Buffer.Length * 2, Length + count));
                System.Buffer.BlockCopy(src, 0, Buffer, Length, count);
                Length += count;
            }

            public void Reset() => Length = 0;
        }
    }

    internal static class HttpUtil
    {
        public static string HeaderValue(string headers, string name)
        {
            foreach (var line in headers.Split('\n'))
            {
                int c = line.IndexOf(':');
                if (c <= 0) continue;
                if (string.Equals(line.Substring(0, c).Trim(), name, StringComparison.OrdinalIgnoreCase))
                    return line.Substring(c + 1).Trim();
            }
            return null;
        }

        /// <summary>요청 라인에서 경로만 뽑는다. ("GET /ws?x=1 HTTP/1.1" -> "/ws")</summary>
        public static string RequestPath(string headers)
        {
            int eol = headers.IndexOf('\n');
            string line = eol < 0 ? headers : headers.Substring(0, eol);
            var parts = line.Trim().Split(' ');
            if (parts.Length < 2) return "/";
            string path = parts[1];
            int q = path.IndexOf('?');
            return q >= 0 ? path.Substring(0, q) : path;
        }
    }
}
