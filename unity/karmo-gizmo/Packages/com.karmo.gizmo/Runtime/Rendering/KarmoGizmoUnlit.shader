Shader "Hidden/KarmoGizmo/Unlit"
{
    Properties
    {
        // Set from ImmediateGizmoDrawer so the same material can draw the gizmo either
        // through solid geometry or occluded by it.
        [Enum(UnityEngine.Rendering.CompareFunction)] _ZTest ("ZTest", Float) = 8
    }

    SubShader
    {
        Tags
        {
            "Queue" = "Overlay"
            "RenderType" = "Overlay"
            "IgnoreProjector" = "True"
            "ForceNoShadowCasting" = "True"
        }

        Pass
        {
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            ZTest [_ZTest]
            Cull Off
            Lighting Off
            Fog { Mode Off }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                fixed4 color : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct v2f
            {
                float4 position : SV_POSITION;
                fixed4 color : COLOR;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            v2f vert (appdata input)
            {
                v2f output;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_INITIALIZE_OUTPUT(v2f, output);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);

                output.position = UnityObjectToClipPos(input.vertex);
                output.color = input.color;
                return output;
            }

            fixed4 frag (v2f input) : SV_Target
            {
                return input.color;
            }
            ENDCG
        }
    }

    Fallback Off
}
