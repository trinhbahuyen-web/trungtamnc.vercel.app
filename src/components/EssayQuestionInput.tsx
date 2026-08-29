import React, { useEffect, useMemo, useRef, useState } from 'react';
import { parseEssayAnswer, serializeEssayAnswer } from '../services/essayGradingService';

interface EssayImage { data: string; type: string; name?: string }

interface EssayQuestionInputProps {
  value?: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxImages?: number;
  disabled?: boolean;
}

async function fileToBase64(file: File): Promise<EssayImage> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ data: String(r.result || '').split(',')[1] || '', type: file.type || 'image/jpeg', name: file.name });
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function EssayQuestionInput({
  value,
  onChange,
  placeholder = 'Nhập bài làm, công thức LaTeX hoặc đính kèm ảnh...',
  maxImages = 3,
  disabled = false,
}: EssayQuestionInputProps) {
  const parsed = useMemo(() => parseEssayAnswer(value || ''), [value]);
  const [text, setText] = useState(parsed.text || '');
  const [images, setImages] = useState<EssayImage[]>(parsed.images || []);
  const [formula, setFormula] = useState('');
  const [showFormula, setShowFormula] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mathRef = useRef<HTMLElement>(null);
  const [mathReady, setMathReady] = useState(false);

  useEffect(() => {
    setText(parsed.text || '');
    setImages(parsed.images || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.customElements?.get('math-field')) {
      setMathReady(true);
      return;
    }
    const id = 'mathlive-cdn-script';
    if (!document.getElementById(id)) {
      const s = document.createElement('script');
      s.id = id;
      s.src = 'https://unpkg.com/mathlive';
      s.defer = true;
      s.onload = () => setMathReady(true);
      document.body.appendChild(s);
    }
    const timer = window.setInterval(() => {
      if (window.customElements?.get('math-field')) {
        setMathReady(true);
        window.clearInterval(timer);
      }
    }, 300);
    return () => window.clearInterval(timer);
  }, []);

  function emit(nextText: string, nextImages: EssayImage[]) {
    onChange(serializeEssayAnswer({ text: nextText, images: nextImages }));
  }

  function updateText(v: string) {
    setText(v);
    emit(v, images);
  }

  async function addImages(files: FileList | null) {
    if (!files || disabled) return;
    const remaining = Math.max(0, maxImages - images.length);
    const selected = Array.from(files).slice(0, remaining);
    const converted = await Promise.all(selected.map(fileToBase64));
    const next = [...images, ...converted];
    setImages(next);
    emit(text, next);
  }

  function removeImage(index: number) {
    const next = images.filter((_, i) => i !== index);
    setImages(next);
    emit(text, next);
  }

  function insertFormula() {
    const latex = formula.trim();
    if (!latex) return;
    updateText(`${text}${text ? '\n' : ''}$${latex}$`);
    setFormula('');
    setShowFormula(false);
  }

  useEffect(() => {
    if (mathRef.current) {
      mathRef.current.addEventListener('input', () => {
        setFormula((mathRef.current as any)?.value || '');
      });
    }
  }, [showFormula, mathReady]);

  return (
    <div className="essay-input">
      <textarea
        className="form-control essay-textarea"
        value={text}
        onChange={(e) => updateText(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={5}
      />
      <div className="essay-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={() => setShowFormula((v) => !v)}>
          + Công thức
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled || images.length >= maxImages} onClick={() => fileRef.current?.click()}>
          + Ảnh bài làm ({images.length}/{maxImages})
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImages(e.target.files)} />
      </div>

      {showFormula && (
        <div className="formula-box">
          <label className="form-label">Nhập công thức</label>
          {mathReady ? (
            React.createElement('math-field' as any, {
              ref: mathRef,
              className: 'mathlive-field',
              value: formula,
            })
          ) : (
            <input className="form-control" value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="VD: x^2+1=0" />
          )}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={insertFormula}>Chèn vào bài làm</button>
          </div>
        </div>
      )}

      {images.length > 0 && (
        <div className="essay-images">
          {images.map((img, i) => (
            <div className="essay-image" key={`${img.name || 'img'}_${i}`}>
              <img src={`data:${img.type};base64,${img.data}`} alt={img.name || 'Ảnh bài làm'} />
              {!disabled && (
                <button type="button" className="essay-image-remove" onClick={() => removeImage(i)}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
