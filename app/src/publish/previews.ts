const previews = new Map<string, string>();

export const rememberPreview = (hash: string, uri: string): void => {
  previews.set(hash, uri);
};

export const previewFor = (hash: string): string | undefined => previews.get(hash);
