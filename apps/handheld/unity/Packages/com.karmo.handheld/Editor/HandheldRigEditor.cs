using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace Handheld.EditorTools
{
    /// <summary>
    /// 리그 인스펙터. 방송 중에 실제로 만지는 것만 위에 두고 나머지는 접는다.
    ///
    /// 어느 칸을 위에 둘지는 **여기 목록에만** 적는다. 목록에 없는 칸은 자동으로 「고급」에
    /// 떨어지므로, 필드를 새로 만들어도 인스펙터에서 사라지지 않는다 — 목록과 코드가
    /// 어긋나 조용히 안 보이게 되는 사고를 막는다.
    /// </summary>
    [CustomEditor(typeof(HandheldRig))]
    public sealed class HandheldRigEditor : Editor
    {
        static readonly string[] Screen = { "aspectMode", "customAspect", "streamHeight", "streamFps" };
        static readonly string[] Lens = { "zoomMin", "zoomMax", "focusMode", "focusDistance", "focusTarget", "aperture" };
        static readonly string[] Shake = { "smoothingHalfLife" };
        static readonly string[] Locks = { "lockPan", "lockTilt", "lockRoll" };
        static readonly string[] Wiring = { "server", "rigRoot" };

        // 상황에 따라 뜻이 없어지는 칸 — 조건이 안 맞으면 아예 안 그린다.
        static bool Relevant(HandheldRig rig, string field)
        {
            switch (field)
            {
                case "customAspect": return rig.aspectMode == HandheldRig.AspectMode.Custom;
                case "focusDistance": return rig.focusMode == HandheldRig.FocusMode.Manual;
                case "focusTarget": return rig.focusMode == HandheldRig.FocusMode.Target;
                default: return true;
            }
        }

        const string PrefAdvanced = "Handheld.Rig.Advanced";
        const string PrefWiring = "Handheld.Rig.Wiring";

        readonly HashSet<string> _placed = new HashSet<string>();

        public override bool RequiresConstantRepaint() => Application.isPlaying || _live;
        bool _live;

        public override void OnInspectorGUI()
        {
            var rig = (HandheldRig)target;
            serializedObject.Update();

            _placed.Clear();
            _placed.Add("m_Script");

            DrawStatusBar(rig);
            EditorGUILayout.Space(6);

            Section("화면", Screen, rig);
            Section("렌즈", Lens, rig);
            Section("흔들림", Shake, rig);
            Section("축 잠금", Locks, rig);

            EditorGUILayout.Space(4);
            DrawRest(rig);

            serializedObject.ApplyModifiedProperties();
        }

        // ── 상태 줄 — 창을 안 열어도 살아 있는지 보인다 ──────────────────────────
        void DrawStatusBar(HandheldRig rig)
        {
            var server = rig.server;
            bool connected = server != null && server.Connected;
            _live = connected;

            var box = new GUIStyle(EditorStyles.helpBox) { padding = new RectOffset(8, 8, 6, 6) };
            using (new EditorGUILayout.VerticalScope(box))
            {
                using (new EditorGUILayout.HorizontalScope())
                {
                    GUILayout.Label(connected ? "● 연결됨" : "○ 폰 없음",
                        Tint(connected ? new Color(0.45f, 0.85f, 0.45f) : Color.gray));
                    GUILayout.FlexibleSpace();
                    if (server != null && server.ReanchorCount > 0)
                        GUILayout.Label($"재정위 {server.ReanchorCount}회",
                            Tint(new Color(0.95f, 0.6f, 0.4f)));
                }

                if (connected)
                    GUILayout.Label(rig.StatusLine, EditorStyles.miniLabel);

                // 받아 쓰는 쪽이 대개 좁게 자른다 — 벗어나면 거기서 조용히 잘린다.
                string warn = rig.CameraFrame.LensOutOfRange();
                if (warn.Length > 0)
                    EditorGUILayout.HelpBox(warn + " 값이 흔한 범위 밖이다 — 받는 쪽에서 잘릴 수 있다.",
                        MessageType.Warning);

                using (new EditorGUILayout.HorizontalScope())
                {
                    if (GUILayout.Button("조종석", EditorStyles.miniButtonLeft))
                        EditorApplication.ExecuteMenuItem("Handheld/조종석");

                    using (new EditorGUI.DisabledScope(server == null))
                    {
                        if (GUILayout.Button("리센터", EditorStyles.miniButtonMid))
                            rig.Recenter();

                        bool rec = server != null && server.Recording;
                        if (GUILayout.Button(rec ? "■ 기록 중" : "● 기록", EditorStyles.miniButtonRight))
                        {
                            if (rec) server.StopRecording();
                            else server.StartRecording();
                        }
                    }
                }
            }
        }

        static GUIStyle Tint(Color c)
        {
            var s = new GUIStyle(EditorStyles.miniBoldLabel);
            s.normal.textColor = c;
            return s;
        }

        // ── 구획 ────────────────────────────────────────────────────────────────
        void Section(string title, string[] fields, HandheldRig rig)
        {
            GUILayout.Label(title, EditorStyles.boldLabel);
            using (new EditorGUI.IndentLevelScope())
            {
                foreach (var f in fields)
                {
                    _placed.Add(f);
                    if (!Relevant(rig, f)) continue;
                    var p = serializedObject.FindProperty(f);
                    if (p != null) EditorGUILayout.PropertyField(p);
                }
            }
            EditorGUILayout.Space(4);
        }

        /// <summary>위에 안 올린 칸 전부. 새 필드가 여기로 떨어지므로 사라지지 않는다.</summary>
        void DrawRest(HandheldRig rig)
        {
            var advanced = new List<SerializedProperty>();
            var wiring = new List<SerializedProperty>();

            var it = serializedObject.GetIterator();
            bool enter = true;
            while (it.NextVisible(enter))
            {
                enter = false;
                if (_placed.Contains(it.name)) continue;
                var copy = it.Copy();
                if (System.Array.IndexOf(Wiring, it.name) >= 0) wiring.Add(copy);
                else advanced.Add(copy);
            }

            Foldout(PrefWiring, $"연결 ({wiring.Count})", wiring,
                "비워 두면 씬에서 알아서 찾는다. 한 씬에 리그가 둘 이상일 때만 손으로 지정.");
            Foldout(PrefAdvanced, $"고급 ({advanced.Count})", advanced,
                "기본값이 실측에서 나온 값이다. 근거는 Documentation~/ 에 있다.");
        }

        static void Foldout(string pref, string title, List<SerializedProperty> props, string hint)
        {
            bool open = EditorPrefs.GetBool(pref, false);
            bool now = EditorGUILayout.Foldout(open, title, true, EditorStyles.foldoutHeader);
            if (now != open) EditorPrefs.SetBool(pref, now);
            if (!now) return;

            using (new EditorGUI.IndentLevelScope())
            {
                EditorGUILayout.LabelField(hint, EditorStyles.miniLabel);
                foreach (var p in props) EditorGUILayout.PropertyField(p, true);
            }
            EditorGUILayout.Space(4);
        }
    }
}
