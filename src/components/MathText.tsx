import React, { useEffect, useRef, memo } from 'react';

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
      typesetClear?: (elements?: HTMLElement[]) => void;
    };
  }
}

interface MathTextProps {
  html: string;
  className?: string;
  block?: boolean;
}

const MathText: React.FC<MathTextProps> = ({ html, className = '', block = false }) => {
  const ref = useRef<HTMLElement>(null);
  const contentHash = useRef('');

  useEffect(() => {
    if (!ref.current) return;
    const next = html || '';
    if (contentHash.current === next) return;
    ref.current.innerHTML = next;
    contentHash.current = next;

    const timer = window.setTimeout(() => {
      if (ref.current && window.MathJax?.typesetPromise) {
        window.MathJax.typesetClear?.([ref.current]);
        window.MathJax.typesetPromise([ref.current]).catch((err) => console.error('MathText typeset error:', err));
      }
    }, 20);

    return () => window.clearTimeout(timer);
  }, [html]);

  const Tag = block ? 'div' : 'span';
  return <Tag ref={ref as any} className={className} />;
};

export default memo(MathText);
