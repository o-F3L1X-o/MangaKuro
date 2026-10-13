import React, { useState, useEffect, useRef } from 'react';
import { ImageOff } from 'lucide-react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  aspectRatio?: string;
  rootMargin?: string;
}

// Single global IntersectionObserver for ultra-low memory & CPU overhead
const observerCallbacks = new Map<Element, (isIntersecting: boolean) => void>();
let globalObserver: IntersectionObserver | null = null;

function getGlobalObserver(rootMargin = '250px'): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return null;
  if (!globalObserver) {
    globalObserver = new IntersectionObserver(
      (entries) => {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const cb = observerCallbacks.get(entry.target);
          if (cb) {
            cb(entry.isIntersecting);
          }
        }
      },
      { rootMargin }
    );
  }
  return globalObserver;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  className = '',
  aspectRatio = 'aspect-[2/3]',
  rootMargin = '250px'
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasLoaded(false);
    setHasError(false);
  }, [src]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = getGlobalObserver(rootMargin);
    if (!observer) {
      setIsVisible(true);
      return;
    }

    observerCallbacks.set(el, (isIntersecting: boolean) => {
      if (isIntersecting) {
        setIsVisible(true);
      }
    });
    observer.observe(el);

    return () => {
      observerCallbacks.delete(el);
      observer.unobserve(el);
    };
  }, [rootMargin, src]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden w-full h-full flex items-center justify-center bg-comic-950 ${aspectRatio}`}
    >
      {isVisible && !hasError ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onLoad={() => setHasLoaded(true)}
          onError={() => {
            setHasLoaded(true);
            setHasError(true);
          }}
          className={`${className} transition-opacity duration-150 ${
            hasLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : null}

      {/* Lightweight static placeholder/error indicator with zero animation overhead */}
      {hasError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-1 p-2 text-center pointer-events-none">
          <ImageOff className="w-5 h-5 text-slate-600" />
          <span className="text-[9px] text-slate-500">Sin vista previa</span>
        </div>
      ) : !hasLoaded ? (
        <div className="absolute inset-0 bg-comic-900/30 flex items-center justify-center pointer-events-none">
          <div className="w-4 h-4 rounded-full border border-slate-700 border-t-indigo-400 opacity-60" />
        </div>
      ) : null}
    </div>
  );
};
