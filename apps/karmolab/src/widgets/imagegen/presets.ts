/**
 * imagegen - 프리셋 데이터 (컨텍스트, 캐릭터, 옵션)
 */
import { t } from '../../lib/i18n';

(function () {
    'use strict';
    const IG = (window.ImageGen = window.ImageGen || {});

    const CONTEXT_PRESETS = {
        bg: [
            { id: 'ingame', icon: '🎮', get label() { return t('imagegen.opt.ingame.label'); }, prompt: `Anime style game screenshot, direct top-down view (90 degree overhead). Wide angle shot. HD-2D style (3D Background + Pixel Art). Setting: Inside a cozy wooden mansion. Wooden floor layout with stairs and rugs. Scattered books, magical effects. Amber-like windows. Simple and cute chibi pixel art characters (SD style) fighting. Maid Alisa sweeping blue slimes. Jiangshi Ling swinging censer. Warm sunlight, god rays. High quality.` },
            { id: 'keyVisual', icon: '🖼️', get label() { return t('imagegen.opt.keyVisual.label'); }, prompt: `Anime style game key visual illustration. Wide angle panoramic view. Interior of a cozy wooden magical mansion. Circular library room with spiral stairs. Foreground: <A> with glasses and broom. Background: <B> sleeping on a sofa. Next to her, <C>. Warm sunlight beaming down, detailed background.` },
            { id: 'lobby', icon: '🏠', get label() { return t('imagegen.opt.lobby.label'); }, prompt: `Anime game background art. Wide shot of the main lobby of a wooden magical mansion. A cozy living room with a large, comfy sofa filled with messy pillows and blankets. Wooden floors, scattered magical books, and a warm fireplace. A feeling of laziness and peace. HD-2D style, bright and welcoming atmosphere.` },
            { id: 'lab', icon: '⚗️', get label() { return t('imagegen.opt.lab.label'); }, prompt: `Anime background art. Wide angle shot of a magical laboratory inside a wooden mansion. Curved wooden walls, messy bookshelves, scattered papers, alchemy flasks. Sunlight streaming through amber windows. Dust motes dancing in the light. Warm, cozy, slightly cluttered but charming atmosphere.` }
        ],
        story: [
            { id: 'ep1', icon: '🍞', get label() { return t('imagegen.opt.ep1.label'); }, prompt: `Anime visual novel cutscene illustration, wide shot. Sweet morning atmosphere. A messy, sunlit bedroom inside a wooden mansion. <A> buried under blankets on a bed. <B> stands by the bed holding cinnamon rolls. Cinematic lighting, detailed background.` },
            { id: 'ep2', icon: '🔋', get label() { return t('imagegen.opt.ep2.label'); }, prompt: `Anime visual novel cutscene illustration, medium shot. Intimate late-night atmosphere. <A> and <B> sitting close on a sofa. <A> sleepily leaning in, touching her forehead to <B>'s forehead. Soft blue magical glowing light. Alisa's eyes closed behind glasses. Warm mood. Cinematic lighting, detailed.` },
            { id: 'ep3', icon: '👓', get label() { return t('imagegen.opt.ep3.label'); }, prompt: `Anime visual novel cutscene illustration, medium shot. Bright afternoon. <B> stands WITHOUT her glasses, wiping them. <A> lying on a sofa, looking at <B> with sparkling, teasing eyes. Sunlight fills the room. Cinematic lighting, high quality.` },
            { id: 'ep4', icon: '🍳', get label() { return t('imagegen.opt.ep4.label'); }, prompt: `Anime visual novel cutscene illustration, wide shot. Comical kitchen chaos. A fantasy kitchen with a giant cauldron bubbling over with purple goo. <B> pointing angrily at a large batter stain on the ceiling. <A> looking away guiltily. Broken eggshells everywhere. Cinematic lighting.` },
            { id: 'ep5', icon: '🌙', get label() { return t('imagegen.opt.ep5.label'); }, prompt: `Anime visual novel cutscene illustration, close up. Emotional night scene. Dark bedroom, moonlight. <A> sitting up in bed, looking scared from nightmare. <B> holding <A>'s hand gently, looking concerned. Cinematic lighting.` },
            { id: 'ep6', icon: '❄️', get label() { return t('imagegen.opt.ep6.label'); }, prompt: `Anime visual novel cutscene illustration, medium shot. Hot summer afternoon atmosphere. <A> sweating and sleeping on a sofa. <B> hugging <A> from behind with a blissful expression. <B>'s yellow paper talisman on her forehead says 'Happy' in Kanji. Warm sunlight, detailed.` },
            { id: 'ep7', icon: '😳', get label() { return t('imagegen.opt.ep7.label'); }, prompt: `Anime visual novel cutscene illustration, close up. <B> looking shy and blushing, trying to hide her face with a fan or hands. But the yellow paper talisman on her forehead clearly shows the Kanji for 'Love' (愛) or 'Joy' (喜). <A> is laughing in the background. Cute comedy atmosphere.` }
        ],
        lab: [
            { id: 'exp_sheep', icon: '🐏', get label() { return t('imagegen.opt.exp_sheep.label'); }, prompt: `Character design sheet, anime style 2D illustration. <A> transformed into a Sheep Hybrid. **Curled Ram Horns (spiral shape) on the side of her head instead of earmuffs.** Messy Orange hair, half-lidded eyes, Shiba-brows, glasses. Wearing her usual loose robe. Cute sheep ears. Soft pastel colors.` },
            { id: 'exp_earmuffs', icon: '🎧', get label() { return t('imagegen.opt.exp_earmuffs.label'); }, prompt: `Character design sheet, anime style 2D illustration. <A> without her hat. **Messy Orange hair is fully visible.** Wearing **Large fluffy Sleeping Earmuffs with an ORANGE spiral pattern** directly on her ears. Half-lidded eyes, Shiba-brows, glasses. Oversized robe. Natural look.` },
            { id: 'exp_winter', icon: '❄️', get label() { return t('imagegen.opt.exp_winter.label'); }, prompt: `Character design sheet, anime style 2D illustration. <A> wearing a **Winter Trapper Hat (Ushanka style) but with a pointy top like a witch hat.** The ear flaps covering her ears have a **distinct spiral pattern.** Fur lining. Messy Orange hair, half-lidded eyes, glasses. Oversized robe. Cozy winter vibe.` }
        ],
        mascot: [
            { id: 'm_idle', icon: '😊', get label() { return t('imagegen.opt.m_idle.label'); }, prompt: `Japanese anime illustration, cel shading, clean lineart. <CHAR>. Neutral calm expression, gentle smile, relaxed pose. White lab coat over navy turtleneck, yellow ribbon. Upper body, facing viewer. Pure white background, isolated character, no sparkles, no white outline, no sticker border.` },
            { id: 'm_happy', icon: '😄', get label() { return t('imagegen.opt.m_happy.label'); }, prompt: `Japanese anime illustration, cel shading, clean lineart. <CHAR>. Happy cheerful expression, big smile, curved happy eyes, blushing cheeks. Joyful pose. White lab coat over navy turtleneck, yellow ribbon. Upper body, facing viewer. Pure white background, isolated character, no sparkles, no white outline, no sticker border.` },
            { id: 'm_sad', icon: '😢', get label() { return t('imagegen.opt.m_sad.label'); }, prompt: `Japanese anime illustration, cel shading, clean lineart. <CHAR>. Sad expression, downturned mouth, teary eyes, single tear drop. White lab coat over navy turtleneck, yellow ribbon. Upper body, facing viewer. Pure white background, isolated character, no sparkles, no white outline, no sticker border.` },
            { id: 'm_shock', icon: '😲', get label() { return t('imagegen.opt.m_shock.label'); }, prompt: `Japanese anime illustration, cel shading, clean lineart. <CHAR>. Shocked surprised expression, wide open eyes, open mouth, startled pose. White lab coat over navy turtleneck, yellow ribbon. Upper body, facing viewer. Pure white background, isolated character, no sparkles, no white outline, no sticker border.` },
            { id: 'm_think', icon: '🤔', get label() { return t('imagegen.opt.m_think.label'); }, prompt: `Japanese anime illustration, cel shading, clean lineart. <CHAR>. Thoughtful expression, eyes looking to the side, flat mouth, contemplative pose. White lab coat over navy turtleneck, yellow ribbon. Upper body, facing viewer. Pure white background, isolated character, no sparkles, no white outline, no sticker border.` },
            { id: 'm_sleep', icon: '😴', get label() { return t('imagegen.opt.m_sleep.label'); }, prompt: `Japanese anime illustration, cel shading, clean lineart. <CHAR>. Sleeping expression, closed eyes, Zzz symbols floating above head. Peaceful relaxed pose. White lab coat over navy turtleneck, yellow ribbon. Upper body, facing viewer. Pure white background, isolated character, no sparkles, no white outline, no sticker border.` },
            { id: 'm_angry', icon: '😠', get label() { return t('imagegen.opt.m_angry.label'); }, prompt: `Japanese anime illustration, cel shading, clean lineart. <CHAR>. Angry expression, furrowed brows, angry mouth, anger vein or steam symbol. Furious pose. White lab coat over navy turtleneck, yellow ribbon. Upper body, facing viewer. Pure white background, isolated character, no sparkles, no white outline, no sticker border.` },
            { id: 'm_love', icon: '🥰', get label() { return t('imagegen.opt.m_love.label'); }, prompt: `Japanese anime illustration, cel shading, clean lineart. <CHAR>. Love-struck expression, heart-shaped eyes, big smile, blushing cheeks, floating heart symbols. Adoring pose. White lab coat over navy turtleneck, yellow ribbon. Upper body, facing viewer. Pure white background, isolated character, no sparkles, no white outline, no sticker border.` },
            { id: 'm_smug', icon: '😏', get label() { return t('imagegen.opt.m_smug.label'); }, prompt: `Japanese anime illustration, cel shading, clean lineart. <CHAR>. Smug expression, one eye winking, sly smirk, confident pose. White lab coat over navy turtleneck, yellow ribbon. Upper body, facing viewer. Pure white background, isolated character, no sparkles, no white outline, no sticker border.` },
            { id: 'm_eating', icon: '🍽️', get label() { return t('imagegen.opt.m_eating.label'); }, prompt: `Japanese anime illustration, cel shading, clean lineart. <CHAR>. Eating expression, mouth with food or snack, happy eyes, eating pose. White lab coat over navy turtleneck, yellow ribbon. Upper body, facing viewer. Pure white background, isolated character, no sparkles, no white outline, no sticker border.` },
            { id: 'm_pointing', icon: '👉', get label() { return t('imagegen.opt.m_pointing.label'); }, prompt: `Japanese anime illustration, cel shading, clean lineart. <CHAR>. Pointing pose, one arm extended pointing forward, smile, attentive expression. White lab coat over navy turtleneck, yellow ribbon. Upper body, facing viewer. Pure white background, isolated character, no sparkles, no white outline, no sticker border.` },
            { id: 'm_cheer', icon: '🎉', get label() { return t('imagegen.opt.m_cheer.label'); }, prompt: `Japanese anime illustration, cel shading, clean lineart. <CHAR>. Excited cheering expression, star-shaped eyes, big grin, sparkles around, celebratory pose. White lab coat over navy turtleneck, yellow ribbon. Upper body, facing viewer. Pure white background, isolated character, no sparkles, no white outline, no sticker border.` }
        ],
        emoji: [
            { id: 'discord', icon: '💬', get label() { return t('imagegen.opt.discord.label'); }, prompt: 'Generate an image: <CHAR>. custom emoji sticker illustration, simple cute design, readable at small size, kawaii style, square composition, white background, single isolated character or object, 2D illustration' },
            { id: 'chibi', icon: '👤', get label() { return t('imagegen.opt.chibi.label'); }, prompt: 'Generate an image: <CHAR>. chibi character emoji sticker, cute anime style, isolated on white background, square format, clear silhouette, mascot icon style, 2D illustration' },
            { id: 'happy', icon: '😄', get label() { return t('imagegen.opt.happy.label'); }, prompt: 'Generate an image: <CHAR>. happy emoji sticker, big smile, cheerful expression, cute kawaii style, square format, white background, 2D illustration' },
            { id: 'sad', icon: '😢', get label() { return t('imagegen.opt.sad.label'); }, prompt: 'Generate an image: <CHAR>. sad emoji sticker, teary eyes, downturned mouth, cute kawaii style, square format, white background, 2D illustration' },
            { id: 'shock', icon: '😲', get label() { return t('imagegen.opt.shock.label'); }, prompt: 'Generate an image: <CHAR>. surprised emoji sticker, wide eyes, open mouth, shocked expression, cute style, square format, white background, 2D illustration' },
            { id: 'angry', icon: '😠', get label() { return t('imagegen.opt.angry.label'); }, prompt: 'Generate an image: <CHAR>. angry emoji sticker, furrowed brows, steam symbol, cute kawaii style, square format, white background, 2D illustration' },
            { id: 'love', icon: '🥰', get label() { return t('imagegen.opt.love.label'); }, prompt: 'Generate an image: <CHAR>. love emoji sticker, heart eyes, blushing cheeks, cute kawaii style, square format, white background, 2D illustration' },
            { id: 'game', icon: '🎮', get label() { return t('imagegen.opt.game.label'); }, prompt: 'Generate an image: <CHAR>. gaming emoji sticker, controller or game themed, cute pixel or cartoon style, square format, white background, 2D illustration' },
            { id: 'cat', icon: '🐱', get label() { return t('imagegen.opt.cat.label'); }, prompt: 'Generate an image: <CHAR>. cat emoji sticker, kawaii cat face, cute simple design, square format, white background, 2D illustration' },
            { id: 'star', icon: '⭐', get label() { return t('imagegen.opt.star.label'); }, prompt: 'Generate an image: <CHAR>. star or sparkle emoji sticker, shiny cute design, square format, white or gradient background, 2D illustration' }
        ]
    };

    const CHARACTER_PRESETS = {
        char: [
            { id: 'witch', icon: '💤', get label() { return t('imagegen.opt.witch.label'); }, shortLabel: 'Yawn, a young witch with messy orange hair and round glasses',
                prompt: `A young adult witch (Yawn). **Very slender body, flat chest (petite).** **Messy Orange hair.** Face: Half-open sleepy eyes (half-lidded), distinctive short thick eyebrows (maro-mayu), **wearing round glasses**, **slightly blushing cheeks (shy)**, expression of finding things troublesome but trying to hide it. **Headwear: Drooping Nightcap (sleeping hat). Accessories: Large fluffy sleeping earmuffs with an ORANGE spiral pattern.** Outfit: Oversized loose fitting witch robe falling off shoulder. Introverted and cute atmosphere, soft colors.` },
            { id: 'alisa', icon: '🧹', get label() { return t('imagegen.opt.alisa.label'); }, shortLabel: 'Alisa, a maid with glasses and black ponytail',
                prompt: `A cute maid (Alisa). Face: Sharp intellectual eyes, stylish glasses (megane), stoic cool beauty expression. Black ponytail. Wearing a classic black and white maid outfit. Holding a large magical broomstick. Dynamic posing. Clean background, detailed.` },
            { id: 'ling', icon: '🧟‍♀️', get label() { return t('imagegen.opt.ling.label'); }, shortLabel: 'Ling, a Jiangshi vampire maid girl',
                prompt: `A beautiful Jiangshi (Chinese vampire) maid girl named Ling. Face: Innocent baby face, mischievous smile. Body: Glamorous and curvy. Dark brown hair in cute twin-buns. Costume: Black Qipao-Maid fusion dress, form-fitting with frills. Paper talisman on forehead. Floating pose. White background, detailed.` },
            /* 화면에 사는 티메토와 같은 사람이 나와야 한다 — 「보라머리 소녀」만으로는
               뽑을 때마다 다른 사람이 됐다(예전 마스코트 12장이 12명이던 이유). */
            { id: 'timeto', icon: '💜', get label() { return t('imagegen.opt.timeto.label'); },
                shortLabel: 'Timeto, girl with lavender hair, two side buns, ahoge, purple eyes',
                prompt: `Timeto (티메토) — young lab director. Long lavender hair with two side buns and an ahoge, large purple eyes, white lab coat over navy turtleneck, yellow ribbon at the chest, black pants and boots` }
        ]
    };

    // Optional SSoT (wiki MD → load-characters-from-wiki): 동일 preset id만 덮어쓰고 나머지(예: timeto) 유지
    try {
        const b = window.KarmoWorld?.bindings?.imagegen?.characters;
        if (Array.isArray(b) && b.length) {
            const byId = new Map(CHARACTER_PRESETS.char.map(row => [row.id, { ...row }]));
            b.forEach(x => {
                if (!x.imagegenPresetId || !x.prompt) return;
                byId.set(x.imagegenPresetId, {
                    id: x.imagegenPresetId,
                    icon: x.icon,
                    label: x.label,
                    shortLabel: x.shortLabel || '',
                    prompt: x.prompt || ''
                });
            });
            CHARACTER_PRESETS.char = Array.from(byId.values());
        }
    } catch (_) {}

    const CUSTOM_INPUT_ID = '_custom';
    const CUSTOM_PRESETS_KEY = 'toolbox_imagegen_custom_presets';
    const CUSTOM_CHARACTERS_KEY = 'toolbox_imagegen_custom_characters';

    /* 탭 이름은 **읽을 때 정한다** — 이 파일은 화면보다 먼저 뜨므로 값으로 두면 한국어로 굳는다. */
    const CONTEXT_TAB_LABELS = {
        get bg() { return t('imagegen.ctxTab.bg'); },
        get story() { return t('imagegen.ctxTab.story'); },
        get lab() { return t('imagegen.ctxTab.lab'); },
        get mascot() { return t('imagegen.ctxTab.mascot'); },
        get emoji() { return t('imagegen.ctxTab.emoji'); },
        get custom() { return t('imagegen.ctxTab.custom'); }
    };
    const CONTEXT_TAB_ICONS = { bg: '🖼️', story: '📖', lab: '⚗️', mascot: '🐱', emoji: '😀', custom: '⭐' };

    const VIBE_OPTIONS = [
        { id: 'none', get label() { return t('imagegen.opt.none.label'); }, suffix: '', get desc() { return t('imagegen.opt.none.desc'); } },
        { id: 'cute', label: '🧸 Cute', suffix: ', cute adorable kawaii pastel colors soft lighting', get desc() { return t('imagegen.opt.cute.desc'); } },
        { id: 'pure', label: '✨ Pure', suffix: ', clean pure white aesthetic, minimal, elegant, soft, ethereal lighting', get desc() { return t('imagegen.opt.pure.desc'); } },
        { id: 'dramatic', label: '⚡ Dramatic', suffix: ', dramatic dynamic pose, bold vibrant colors, cinematic lighting, high contrast', get desc() { return t('imagegen.opt.dramatic.desc'); } },
        { id: 'spicy', label: '🔥 Spicy', suffix: ', alluring romantic atmosphere, warm passionate lighting, captivating mood, smoldering gaze', get desc() { return t('imagegen.opt.spicy.desc'); } },
        { id: 'dark', label: '🌑 Dark', suffix: ', dark moody atmosphere, gothic, muted colors, dramatic shadows', get desc() { return t('imagegen.opt.dark.desc'); } },
        { id: 'retro', label: '📺 Retro', suffix: ', 80s retro anime style, VHS aesthetic, warm vintage color palette, film grain', get desc() { return t('imagegen.opt.retro.desc'); } },
        { id: 'pixel', label: '👾 Pixel', suffix: ', pixel art style, 16-bit retro game sprite, limited color palette', get desc() { return t('imagegen.opt.pixel.desc'); } }
    ];

    const ASPECT_RATIOS = [
        { value: '16:9', get label() { return t('imagegen.opt.16_9.label'); } },
        { value: '1:1', get label() { return t('imagegen.opt.1_1.label'); } },
        { value: '9:16', get label() { return t('imagegen.opt.9_16.label'); } },
        { value: '3:4', get label() { return t('imagegen.opt.3_4.label'); } },
        { value: '4:3', get label() { return t('imagegen.opt.4_3.label'); } },
        { value: '3:2', get label() { return t('imagegen.opt.3_2.label'); } },
        { value: '2:3', get label() { return t('imagegen.opt.2_3.label'); } }
    ];

    const SAFETY_LEVELS = [
        { value: 'OFF', get label() { return t('imagegen.opt.OFF.label'); } },
        { value: 'BLOCK_NONE', get label() { return t('imagegen.opt.BLOCK_NONE.label'); } },
        { value: 'BLOCK_ONLY_HIGH', get label() { return t('imagegen.opt.BLOCK_ONLY_HIGH.label'); } },
        { value: 'BLOCK_MEDIUM_AND_ABOVE', get label() { return t('imagegen.opt.BLOCK_MEDIUM_AND_ABOVE.label'); } },
        { value: 'BLOCK_LOW_AND_ABOVE', get label() { return t('imagegen.opt.BLOCK_LOW_AND_ABOVE.label'); } }
    ];

    const PERSON_GEN_OPTIONS = [
        { value: 'allow_adult', get label() { return t('imagegen.opt.allow_adult.label'); } },
        { value: 'allow_all', get label() { return t('imagegen.opt.allow_all.label'); } },
        { value: 'dont_allow', get label() { return t('imagegen.opt.dont_allow.label'); } }
    ];

    function getSlotsFromPrompt(prompt: string): string[] {
        const m = prompt.match(/<([A-Z]+)>/g);
        return m ? [...new Set(m.map(s => s.slice(1, -1)))] : [];
    }

    function loadCustomCharacters(): unknown[] {
        try {
            const raw = localStorage.getItem(CUSTOM_CHARACTERS_KEY);
            return raw ? JSON.parse(raw) || [] : [];
        }
        catch (_) { return []; }
    }

    function saveCustomCharacters(list: unknown[]) {
        localStorage.setItem(CUSTOM_CHARACTERS_KEY, JSON.stringify(list));
    }

    function getCharacterOptions() {
        const builtin = CHARACTER_PRESETS.char || [];
        const custom = loadCustomCharacters();
        return [...builtin, ...custom];
    }

    function loadCustomPresets(): unknown[] {
        try {
            const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
            return raw ? JSON.parse(raw) || [] : [];
        }
        catch (_) { return []; }
    }

    function saveCustomPresets(list: unknown[]) {
        localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(list));
    }

    Object.assign(IG, {
        CONTEXT_PRESETS,
        CHARACTER_PRESETS,
        CUSTOM_INPUT_ID,
        CUSTOM_PRESETS_KEY,
        CUSTOM_CHARACTERS_KEY,
        CONTEXT_TAB_LABELS,
        CONTEXT_TAB_ICONS,
        VIBE_OPTIONS,
        ASPECT_RATIOS,
        SAFETY_LEVELS,
        PERSON_GEN_OPTIONS,
        getSlotsFromPrompt,
        loadCustomCharacters,
        saveCustomCharacters,
        getCharacterOptions,
        loadCustomPresets,
        saveCustomPresets
    });
})();
