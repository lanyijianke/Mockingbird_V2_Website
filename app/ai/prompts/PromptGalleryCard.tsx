'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
    activatePromptCardPreview,
    deactivatePromptCardPreview,
    resolvePromptCardPreviewUrl,
} from './prompt-card-preview';

interface PromptGalleryCardProps {
    href: string;
    title: string;
    categoryName: string;
    copyCount: number;
    anchorId?: string;
    coverImageUrl?: string | null;
    cardPreviewVideoUrl?: string | null;
    videoPreviewUrl?: string | null;
    animationDelay?: string;
}

export default function PromptGalleryCard({
    href,
    title,
    categoryName,
    copyCount,
    anchorId,
    coverImageUrl,
    cardPreviewVideoUrl,
    videoPreviewUrl,
    animationDelay,
}: PromptGalleryCardProps) {
    const [isPreviewActive, setIsPreviewActive] = useState(false);
    const [hoverCapable, setHoverCapable] = useState(false);
    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [playOnLoad, setPlayOnLoad] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const isHoveringRef = useRef(false);
    const resolvedPreviewUrl = resolvePromptCardPreviewUrl(cardPreviewVideoUrl, videoPreviewUrl);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }

        const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
        const apply = () => setHoverCapable(mediaQuery.matches);
        apply();

        const listener = () => apply();
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', listener);
            return () => mediaQuery.removeEventListener('change', listener);
        }

        mediaQuery.addListener(listener);
        return () => mediaQuery.removeListener(listener);
    }, []);

    async function handlePointerEnter(pointerType: string) {
        if (!resolvedPreviewUrl || !hoverCapable || pointerType !== 'mouse') return;

        isHoveringRef.current = true;
        if (!videoSrc) {
            setVideoSrc(resolvedPreviewUrl);
            setPlayOnLoad(true);
            return;
        }

        const didStart = await activatePromptCardPreview(videoRef.current, pointerType, hoverCapable);

        if (!isHoveringRef.current) {
            deactivatePromptCardPreview(videoRef.current);
            return;
        }

        setIsPreviewActive(didStart);
    }

    function handlePointerLeave() {
        isHoveringRef.current = false;
        setPlayOnLoad(false);
        setIsPreviewActive(false);
        deactivatePromptCardPreview(videoRef.current);
    }

    async function handleVideoLoadedData() {
        if (!isHoveringRef.current || !playOnLoad) return;

        const didStart = await activatePromptCardPreview(videoRef.current, 'mouse', hoverCapable);
        if (isHoveringRef.current) {
            setIsPreviewActive(didStart);
        }
        setPlayOnLoad(false);
    }

    return (
        <Link
            id={anchorId}
            href={href}
            className="prompt-card-v2"
            style={animationDelay ? { animationDelay } : undefined}
            onPointerEnter={(event) => void handlePointerEnter(event.pointerType)}
            onPointerLeave={handlePointerLeave}
        >
            <div className="pc2-cover">
                {coverImageUrl ? (
                    <Image
                        src={coverImageUrl}
                        alt={title}
                        fill
                        className={`pc2-cover-image ${isPreviewActive ? 'is-hidden' : ''}`}
                        sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, 25vw"
                        style={{ objectFit: 'cover' }}
                        unoptimized
                    />
                ) : (
                    <div className="pc2-cover-empty">
                        <i className="bi bi-lightbulb" />
                    </div>
                )}

                {resolvedPreviewUrl && (
                    <>
                        {hoverCapable && videoSrc && (
                            <video
                                ref={videoRef}
                                src={videoSrc}
                                poster={coverImageUrl || undefined}
                                muted
                                loop
                                playsInline
                                preload="none"
                                className={`pc2-video-preview ${isPreviewActive ? 'is-visible' : ''}`}
                                aria-hidden="true"
                                onLoadedData={() => void handleVideoLoadedData()}
                            />
                        )}
                        <span className="pc2-video-badge">
                            <i className="bi bi-play-circle-fill" />
                        </span>
                    </>
                )}

                <span className="pc2-stat">
                    <i className="bi bi-clipboard" /> {copyCount.toLocaleString()}
                </span>

                <div className="pc2-overlay">
                    <span className="pc2-category">{categoryName}</span>
                    <h3 className="pc2-title">{title}</h3>
                </div>
            </div>
        </Link>
    );
}
