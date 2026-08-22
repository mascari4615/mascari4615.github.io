using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Handheld.Tests
{
    /// <summary>
    /// **실제로 소켓을 열고 값이 건너가는지** 잰다. 인코더·디코더 단위 시험이 다 초록이어도
    /// 배선이 어긋나면(포트·이름·보내는 주기·스레드) 전선에서는 아무것도 안 온다 —
    /// 그건 단위 시험이 못 잡는 자리다.
    ///
    /// 한 프로세스 안의 되돌림(loopback)이라 「다른 PC 에서도 된다」의 증거는 아니다.
    /// 다만 **규약과 배선이 맞다**는 것까지는 여기서 닫힌다.
    /// </summary>
    public class VmcLoopbackTests
    {
        // 진짜 VMC 앱(39539)과 안 부딪히게 높은 자리를 쓴다.
        const int Port = 39597;

        [UnityTest]
        public IEnumerator 자세가_전선을_건너_그대로_도착한다()
        {
            var srcGo = new GameObject("vmc-src");
            var dstGo = new GameObject("vmc-dst");
            try
            {
                var srcCam = srcGo.AddComponent<Camera>();
                srcCam.fieldOfView = 42f;
                srcGo.transform.SetPositionAndRotation(
                    new Vector3(1.5f, 2.25f, -3f), Quaternion.Euler(11f, 222f, -33f));

                var dstCam = dstGo.AddComponent<Camera>();
                var rx = dstGo.AddComponent<VmcCameraReceiver>();
                rx.port = Port;
                rx.cameraName = "LoopTest";
                rx.targetCamera = dstCam;
                rx.usePhysicalLens = false;
                yield return null;                      // 수신부가 포트를 잡을 틈

                Assert.IsEmpty(rx.LastError, "수신부가 포트를 못 잡았다: " + rx.LastError);

                var tx = srcGo.AddComponent<VmcCameraSender>();
                tx.sourceCamera = srcCam;
                tx.host = "127.0.0.1";
                tx.port = Port;
                tx.cameraName = "LoopTest";
                tx.sendHz = 60;

                // 되돌림이라 금방 오지만, 못 오면 무한정 기다리지 않는다.
                float until = Time.realtimeSinceStartup + 3f;
                while (rx.ReceivedCount == 0 && Time.realtimeSinceStartup < until) yield return null;

                Assert.Greater(rx.ReceivedCount, 0,
                    "3초 동안 한 통도 안 왔다 (보낸 통 " + tx.SentCount + " · 오류 '" + tx.LastError + "')");

                Assert.Less(Vector3.Distance(srcGo.transform.position, dstGo.transform.position), 1e-3f,
                    "자리가 안 맞는다");
                Assert.Less(Quaternion.Angle(srcGo.transform.rotation, dstGo.transform.rotation), 0.05f,
                    "자세가 안 맞는다");
                Assert.AreEqual(42f, dstCam.fieldOfView, 0.05f, "화각이 안 맞는다");

                // 움직이면 따라온다 — 한 번 맞은 게 우연이 아니라는 것.
                srcGo.transform.position = new Vector3(-4f, 0.5f, 8f);
                srcGo.transform.rotation = Quaternion.Euler(-25f, 60f, 5f);
                int seen = rx.ReceivedCount;
                until = Time.realtimeSinceStartup + 3f;
                while (rx.ReceivedCount <= seen && Time.realtimeSinceStartup < until) yield return null;

                Assert.Less(Vector3.Distance(srcGo.transform.position, dstGo.transform.position), 1e-3f,
                    "움직였는데 안 따라온다");
            }
            finally
            {
                Object.DestroyImmediate(srcGo);
                Object.DestroyImmediate(dstGo);
            }
        }

        [UnityTest]
        public IEnumerator 다른_이름으로_오면_안_따라간다()
        {
            var srcGo = new GameObject("vmc-src2");
            var dstGo = new GameObject("vmc-dst2");
            try
            {
                var rx = dstGo.AddComponent<VmcCameraReceiver>();
                rx.port = Port + 1;
                rx.cameraName = "Mine";
                rx.targetCamera = dstGo.AddComponent<Camera>();
                yield return null;

                var srcCam = srcGo.AddComponent<Camera>();
                srcGo.transform.position = new Vector3(7f, 7f, 7f);
                var tx = srcGo.AddComponent<VmcCameraSender>();
                tx.sourceCamera = srcCam;
                tx.host = "127.0.0.1";
                tx.port = Port + 1;
                tx.cameraName = "Someone else";

                float until = Time.realtimeSinceStartup + 1.5f;
                while (Time.realtimeSinceStartup < until) yield return null;

                Assert.Greater(tx.SentCount, 0, "보내지도 못했다면 이 시험은 아무것도 안 잰다");
                Assert.AreEqual(0, rx.ReceivedCount, "남의 이름을 따라갔다");
                Assert.AreEqual(Vector3.zero, dstGo.transform.position);
            }
            finally
            {
                Object.DestroyImmediate(srcGo);
                Object.DestroyImmediate(dstGo);
            }
        }
    }
}
