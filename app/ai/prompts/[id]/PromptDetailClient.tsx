'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { safeJsonParse } from '../safeJsonParse';

interface RelatedPromptItem {
    id: number;
    title: string;
    coverImageUrl: string | null | undefined;
    category: string;
    copyCount: number;
}

interface ExplorationLink {
    href: string;
    title: string;
    description: string;
}

interface PromptDetailClientProps {
    images: string[];
    content: string;
    videoUrl?: string | null;
    backHref: string;
    title: string;
    categoryName: string;
    description: string;
    author: string;
    copyCount: number;
    dateStr: string;
    sourceUrl?: string | null;
    isJson: boolean;
    relatedPrompts: RelatedPromptItem[];
    explorationLinks?: ExplorationLink[];
}

function sanitizeExternalUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
        return null;
    }
}

export default function PromptDetailClient({
    images,
    content,
    videoUrl,
    backHref,
    title,
    categoryName,
    description,
    author,
    copyCount,
    dateStr,
    sourceUrl,
    isJson,
    relatedPrompts,
    explorationLinks = [],
}: PromptDetailClientProps) {
    const [activeImage, setActiveImage] = useState(images[0] || '');
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignored */ }
    }, [content]);

    // Format JSON content for display
    let displayContent = content;
    if (isJson) {
        const parsed = safeJsonParse<unknown>(content);
        if (parsed !== undefined) {
            displayContent = JSON.stringify(parsed, null, 2);
        }
    }
    const safeSourceUrl = sanitizeExternalUrl(sourceUrl);

    useEffect(() => {
        if (!isLightboxOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsLightboxOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isLightboxOpen]);

    return (
        <div className="pd-container">
            {/* 浮动返回按钮 */}
            <Link href={backHref} className="pd-back-float">
                <i className="bi bi-arrow-left" />
            </Link>

            <div className="pd-layout">
                {/* ═══ 左侧: 媒体展示 (Sticky on desktop) ═══ */}
                <div className="pd-media animate-fade-right">
                    {videoUrl ? (
                        <div className="pd-showcase pd-video glass">
                            <video
                                src={videoUrl}
                                controls
                                loop
                                playsInline
                                className="pd-video-player"
                            />
                            <span className="pd-video-badge">
                                <i className="bi bi-play-circle-fill" /> 视频
                            </span>
                        </div>
                    ) : images.length > 0 ? (
                        <>
                            <div className="pd-showcase pd-gallery glass">
                                <span className="pd-image-badge">
                                    <i className="bi bi-image-fill" /> 仅封面图
                                </span>
                                <button
                                    type="button"
                                    className="pd-main-img pd-main-img-button"
                                    aria-label="放大查看图片"
                                    onClick={() => setIsLightboxOpen(true)}
                                >
                                    <Image
                                        src={activeImage}
                                        alt={title}
                                        fill
                                        sizes="(max-width: 768px) 100vw, 560px"
                                        style={{ objectFit: 'contain' }}
                                        priority
                                    />
                                    <span className="pd-zoom-hint">
                                        <i className="bi bi-arrows-fullscreen" />
                                    </span>
                                </button>
                                {images.length > 1 && (
                                    <div className="pd-thumbs">
                                        {images.map((img, i) => (
                                            <div
                                                key={i}
                                                className={`pd-thumb ${activeImage === img ? 'active' : ''}`}
                                                onClick={() => setActiveImage(img)}
                                            >
                                                <Image src={img} alt={`预览 ${i + 1}`} fill sizes="48px" style={{ objectFit: 'cover' }} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="pd-showcase pd-empty glass">
                            <i className="bi bi-image" />
                            <p>暂无预览</p>
                        </div>
                    )}
                </div>

                {/* ═══ 右侧: 提示词信息 ═══ */}
                <div className="pd-content animate-fade-left">
                    {/* 元信息 */}
                    <div className="pd-meta">
                        <span className="pd-category">
                            <i className="bi bi-tag-fill" /> {categoryName}
                        </span>
                        <span className="pd-date">{dateStr}</span>
                        {author && <span className="pd-author"><i className="bi bi-person" /> {author}</span>}
                    </div>

                    <h1 className="pd-title">{title}</h1>

                    {description && (
                        <p className="pd-desc">{description}</p>
                    )}

                    {/* 统计行 */}
                    <div className="pd-stats">
                        <span className="pd-stat-chip">
                            <i className="bi bi-clipboard-data" />
                            {copyCount.toLocaleString()} 次复制
                        </span>
                        {safeSourceUrl && (
                            <a href={safeSourceUrl} target="_blank" rel="noopener noreferrer" className="pd-stat-chip pd-source">
                                <i className="bi bi-link-45deg" /> 原始来源
                            </a>
                        )}
                    </div>

                    {/* 终端风格提示词框 */}
                    <section className="pd-terminal glass">
                        <div className="pd-term-header">
                            <div className="pd-term-dots">
                                <span className="dot red" />
                                <span className="dot yellow" />
                                <span className="dot green" />
                            </div>
                            <span className="pd-term-label">提示词</span>
                            <button
                                className={`pd-copy-btn ${copied ? 'copied' : ''}`}
                                onClick={handleCopy}
                            >
                                <i className={`bi ${copied ? 'bi-check2' : 'bi-clipboard'}`} />
                                {copied ? '已复制' : '复制'}
                            </button>
                        </div>
                        <div className="pd-term-body">
                            <pre className="pd-prompt-text">{displayContent}</pre>
                        </div>
                    </section>
                </div>
            </div>

            {/* ═══ 更多提示词推荐 ═══ */}
            {relatedPrompts.length > 0 && (
                <section className="pd-related-section">
                    <div className="pd-related-header">
                        <h2 className="pd-related-title"><i className="bi bi-lightbulb" /> 更多提示词推荐</h2>
                    </div>
                    <div className="pd-related-grid">
                        {relatedPrompts.map(p => (
                            <Link key={p.id} href={`/ai/prompts/${p.id}`} className="pd-related-card">
                                <div className="pd-related-card-cover">
                                    {p.coverImageUrl ? (
                                        <Image
                                            src={p.coverImageUrl}
                                            alt={p.title}
                                            fill
                                            sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, 25vw"
                                            style={{ objectFit: 'cover' }}
                                        />
                                    ) : (
                                        <div className="pd-related-card-empty">
                                            <i className="bi bi-lightbulb" />
                                        </div>
                                    )}
                                    <span className="pd-related-card-stat">
                                        <i className="bi bi-clipboard" /> {p.copyCount.toLocaleString()}
                                    </span>
                                </div>
                                <div className="pd-related-card-info">
                                    <span className="pd-related-card-category">{p.category}</span>
                                    <h3 className="pd-related-card-title">{p.title}</h3>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {explorationLinks.length > 0 && (
                <section className="pd-related-section" aria-label="延伸探索">
                    <div className="pd-related-header">
                        <h2 className="pd-related-title"><i className="bi bi-compass" /> 延伸探索</h2>
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '1rem',
                        }}
                    >
                        {explorationLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="glass glass-card"
                                style={{ padding: '1.25rem', textDecoration: 'none', color: 'inherit' }}
                            >
                                <div style={{ display: 'grid', gap: '0.45rem' }}>
                                    <span className="pd-related-card-category">浏览更多提示词分类</span>
                                    <h3 className="pd-related-card-title">{link.title}</h3>
                                    <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                        {link.description}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {isLightboxOpen && activeImage && (
                <div
                    className="pd-lightbox"
                    role="dialog"
                    aria-modal="true"
                    aria-label="图片预览"
                    onClick={() => setIsLightboxOpen(false)}
                >
                    <button
                        type="button"
                        className="pd-lightbox-close"
                        aria-label="关闭图片预览"
                        onClick={() => setIsLightboxOpen(false)}
                    >
                        <i className="bi bi-x-lg" />
                    </button>
                    <div className="pd-lightbox-frame" onClick={(event) => event.stopPropagation()}>
                        <Image
                            src={activeImage}
                            alt={title}
                            fill
                            sizes="100vw"
                            className="pd-lightbox-image"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
