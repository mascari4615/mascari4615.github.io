import { DEFAULT_VERTEX_LOCATION } from 'karmolab-ai';
import { chatbotUiSurfaceToPackage, getChatbotApiSurfaceUi } from './api-surface';
import type { ChatbotCharacter, KarmoImageSpec } from '../../../types/karmolab';
import { t, loadNamespace } from '../../lib/i18n';

/** 스트리밍 표시용 KARMO_IMAGE 태그 제거·파싱·캐릭터 이미지 생성 */
(function () {
    const KARMO_IMAGE_RE = /\[\[KARMO_IMAGE:(\{[\s\S]*?\})\]\]/;

    function displayTextForStream(s: string): string {
        const start = s.indexOf('[[KARMO_IMAGE:');
        if (start === -1) return s;
        const tail = s.slice(start);
        const m = tail.match(/^\[\[KARMO_IMAGE:\{[\s\S]*?\}\]\]/);
        if (m) return (s.slice(0, start) + s.slice(start + m[0].length)).trimEnd();
        return s.slice(0, start).trimEnd();
    }

    function extractKarmoImage(text: string): { cleanText: string; spec: KarmoImageSpec | null } {
        const m = text.match(KARMO_IMAGE_RE);
        if (!m) return { cleanText: text.trim(), spec: null };
        try {
            const spec = JSON.parse(m[1]) as KarmoImageSpec;
            const cleanText = text.replace(KARMO_IMAGE_RE, '').trim();
            return { cleanText, spec };
        } catch (_) {
            return { cleanText: text.replace(KARMO_IMAGE_RE, '').trim(), spec: null };
        }
    }

    async function appendCharacterImageAfterMessage(
        wrap: HTMLElement | null,
        char: ChatbotCharacter | null,
        spec: KarmoImageSpec | null
    ): Promise<void> {
        if (!wrap?.parentNode || !spec?.show || !spec.prompt) return;
        const loading = document.createElement('div');
        loading.className = 'cb-msg cb-msg-bot cb-msg-image cb-msg-image-loading';
        loading.textContent = t('chatbot.t111');
        wrap.parentNode.insertBefore(loading, wrap.nextSibling);

        const sceneEn = String(spec.prompt).slice(0, 800);
        const vis = char?.visualDescription ? String(char.visualDescription).slice(0, 600) : '';
        const fullPrompt = [
            'High quality illustration, single clear subject, no text in image.',
            vis ? `Character appearance (keep consistent): ${vis}` : '',
            `Scene and mood: ${sceneEn}`
        ].filter(Boolean).join('\n');

        const imgModelSel = document.getElementById('cbCharImageModel') as HTMLSelectElement | null;
        const imgModel = imgModelSel?.value || (typeof Gemini !== 'undefined' && Gemini.getDefaultModel ? Gemini.getDefaultModel('geminiImage') : 'gemini-2.5-flash-image');

        const ref = char?.referenceImageDataUrl;
        const opt: Record<string, unknown> = {};
        if (ref && ref.startsWith('data:')) opt.referenceImage = ref;

        const G = Gemini;
        if (!G) throw new Error(t('chatbot.err.112'));

        try {
            let res;
            if (chatbotUiSurfaceToPackage(getChatbotApiSurfaceUi()) === 'vertex') {
                if (!G.requireVertexApiKey?.()) {
                    loading.className = 'cb-msg cb-msg-bot cb-msg-error cb-msg-image';
                    loading.textContent = t('chatbot.t113');
                    return;
                }
                const projectId = (Toolbox.getPref?.('ig_vertex_project_id', '') || '').trim();
                if (!projectId) {
                    loading.className = 'cb-msg cb-msg-bot cb-msg-error cb-msg-image';
                    loading.textContent = t('chatbot.t114');
                    Toolbox.showToast?.(t('chatbot.t115'), 'error');
                    return;
                }
                const locationRaw = (Toolbox.getPref?.('ig_vertex_location', '') || '').trim();
                const location = locationRaw || DEFAULT_VERTEX_LOCATION;
                if (!G.callVertexGeminiImage) throw new Error(t('chatbot.err.116'));
                res = await G.callVertexGeminiImage(fullPrompt, imgModel, {
                    ...opt,
                    projectId,
                    location,
                });
            } else {
                if (!G.callGeminiImage) throw new Error(t('chatbot.err.117'));
                res = await G.callGeminiImage(fullPrompt, imgModel, opt);
            }
            loading.remove();
            const box = document.createElement('div');
            box.className = 'cb-msg cb-msg-bot cb-msg-image';
            const img = document.createElement('img');
            img.src = res.dataUrl;
            img.alt = t('chatbot.t118');
            box.appendChild(img);
            wrap.parentNode.insertBefore(box, wrap.nextSibling);
            const msgs = document.getElementById('cbMessages');
            if (msgs) msgs.scrollTop = msgs.scrollHeight;
            if (res.usage?.totalTokenCount) Toolbox.recordUsage?.('image', res.usage.totalTokenCount);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            loading.className = 'cb-msg cb-msg-bot cb-msg-error cb-msg-image';
            loading.textContent = t('chatbot.t119') + msg;
            Toolbox.showToast?.(msg || t('chatbot.imageError'), 'error', e);
        }
    }

    window.ChatbotKarmoImage = {
        KARMO_IMAGE_RE,
        displayTextForStream,
        extractKarmoImage,
        appendCharacterImageAfterMessage
    };
})();
