export function renderPromptTemplateDefaults(content: string): string {
    return content
        .replace(/\{argument\s+[^{}]*default=(["'])(.*?)\1[^{}]*\}/g, (_match, _quote: string, defaultValue: string) => {
            return defaultValue;
        })
        .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2')
        .replace(/([\u4e00-\u9fff])\s+([。！？；，、])/g, '$1$2');
}
