import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API } from '../api';
import { Icon } from '../components/Icon';
import { CATEGORY_ICON } from '../components/format';
import { CATEGORIES, ErrorBanner } from '../components/ui';

const MAX_PHOTO = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function Raise() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [photoErr, setPhotoErr] = useState('');
  const [errors, setErrors] = useState<{ category?: string; title?: string }>({});

  useEffect(() => {
    if (!photo || typeof URL.createObjectURL !== 'function') { setPreview(''); return; }
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  const create = useMutation({
    mutationFn: (f: FormData) => API.requests.create(f),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['requests'] });
      navigate(`/requests/${r.id}`);
    },
  });

  const pick = (f: File | undefined) => {
    setPhotoErr('');
    if (!f) { setPhoto(null); return; }
    if (!TYPES.includes(f.type)) { setPhoto(null); setPhotoErr('Only JPEG, PNG or WebP photos are allowed'); return; }
    if (f.size > MAX_PHOTO) { setPhoto(null); setPhotoErr('The photo must be 5 MB or smaller'); return; }
    setPhoto(f);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!category) errs.category = 'Choose what the request is about';
    if (!title.trim()) errs.title = 'Add a short title';
    setErrors(errs);
    if (errs.category || errs.title || photoErr) return;
    const f = new FormData();
    f.set('category', category);
    f.set('title', title.trim());
    if (description.trim()) f.set('description', description.trim());
    if (photo) f.set('photo', photo);
    create.mutate(f);
  };

  return (
    <div className="page">
      <h1 className="hero-title">Raise a request</h1>
      <form className="card stack form-card" onSubmit={submit} noValidate>
        <div className="field">
          <span id="cat-l" className="lbl">What is it about?</span>
          <div className="cat-tiles" role="radiogroup" aria-labelledby="cat-l">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={category === c} className={`cat-tile ${category === c ? 'on' : ''}`}
                onClick={() => { setCategory(c); setErrors((x) => ({ ...x, category: undefined })); }}>
                <Icon name={CATEGORY_ICON[c] ?? 'wrench'} />
                <span>{c.charAt(0).toUpperCase() + c.slice(1)}</span>
              </button>
            ))}
          </div>
          {errors.category && <p className="banner err" role="alert">{errors.category}</p>}
        </div>
        <div className="field">
          <label htmlFor="rt">Title</label>
          <input id="rt" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} placeholder="For example: Tap leaking in kitchen" />
          {errors.title && <p className="banner err" role="alert">{errors.title}</p>}
        </div>
        <div className="field">
          <label htmlFor="rd">Details (optional)</label>
          <textarea id="rd" rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rp">Photo (optional)</label>
          <input id="rp" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
          {photoErr && <p className="banner err" role="alert">{photoErr}</p>}
          {preview && <img className="rq-photo" src={preview} alt="Selected photo preview" />}
        </div>
        <ErrorBanner error={create.error} />
        <button type="submit" className="btn btn-primary btn-lg" disabled={create.isPending}>
          {create.isPending ? 'Sending…' : 'Send request'}
        </button>
      </form>
    </div>
  );
}
