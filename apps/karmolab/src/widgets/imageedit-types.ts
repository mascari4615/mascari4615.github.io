/** imageedit 위젯 도메인 인터페이스 — KL-112 */

export interface IeHistoryItem {
    data: ImageData;
    w: number;
    h: number;
}

export interface IeCropState {
    x: number;
    y: number;
    w: number;
    h: number;
    scaleX: number;
    scaleY: number;
    maxW: number;
    maxH: number;
    dragging: string | null;
    startX: number;
    startY: number;
    startCrop: { x: number; y: number; w: number; h: number } | null;
}

export interface IeImageSourceMeta {
    displayName: string;
    sourceBytes: number | null;
    bytesKind: 'file' | 'dataUrl' | null;
    sourceNaturalW: number | null;
    sourceNaturalH: number | null;
    exifLines: string[] | null;
}

export interface IeBatchState {
    files: File[];
}

export type IeExifTags = Record<number, unknown>;
