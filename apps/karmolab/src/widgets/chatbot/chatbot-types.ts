export interface CbChatPart {
    text?: string;
    inlineData?: { mimeType: string; data: string };
}

export interface CbChatMessage {
    role: 'user' | 'model';
    parts: CbChatPart[];
}

export interface CbSession {
    id: string;
    name: string;
    createdAt: number;
}

export interface CbPendingImage {
    base64: string;
    mimeType: string;
    dataUrl: string;
}
