/** imagegen 위젯 전용 도메인 타입 — imagegen.ts / core.ts 공용 */

export type IgQueueStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled';

export interface IgGenerationOptions {
    apiRoute: string;
    modelId: string;
    aspectRatio: string;
    safetyThreshold: string;
    vibeSuffix: string;
    vertexProjectId: string;
    vertexLocation: string;
    negativePrompt?: string;
    personGeneration?: string;
}

export interface IgQueueItem {
    id: number;
    prompt: string;
    finalPrompt: string;
    options: IgGenerationOptions;
    status: IgQueueStatus;
    abortController: AbortController | null;
    elapsed: string | null;
    error: string | null;
    emojiChar?: string;
    resultItem?: ImageDBItem;
}

export interface IgContextPreset {
    id: string;
    label: string;
    icon: string;
    prompt: string;
    [key: string]: unknown;
}

export interface IgCharacterOption {
    id: string;
    label: string;
    icon?: string;
    prompt: string;
    shortLabel?: string;
}

export interface IgState {
    sessionGallery: ImageDBItem[];
    currentItem: ImageDBItem | null;
    compareMode: boolean;
    currentContextTab: string;
    currentContextPreset: IgContextPreset | null;
    slotValues: Record<string, string>;
    igPresetPopup: HTMLDivElement | null;
}
