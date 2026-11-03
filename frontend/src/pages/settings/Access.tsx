import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type AccessMatrix } from '../../api';
import { Toggle } from '../../components/Toggle';

const clone = (m: AccessMatrix): AccessMatrix => JSON.parse(JSON.stringify(m)) as AccessMatrix;
const same = (a: AccessMatrix, b: AccessMatrix) => JSON.stringify(a) === JSON.stringify(b);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function AccessPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['access'], queryFn: API.admin.access });
  const [draft, setDraft] = useState<AccessMatrix | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (q.data) setDraft(clone(q.data.matrix));
  }, [q.data]);

  const save = useMutation({
    mutationFn: (m: AccessMatrix) => API.admin.setAccess(m),
    onSuccess: (r) => {
      qc.setQueryData(['access'], r);
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  if (q.error) return <p className="banner err" role="alert">{q.error.message}</p>;
  if (!q.data || !draft) return <p className="muted">Loading…</p>;
  const { roles, permissions, matrix } = q.data;
  const dirty = !same(draft, matrix);

  const flip = (role: string, key: string, v: boolean) => {
    setSaved(false);
    save.reset();
    setDraft({ ...draft, [role]: { ...draft[role], [key]: v } });
  };

  return (
    <div className="stack">
      <p className="muted">Choose what each kind of resident can do. The committee always has full access.</p>
      <div className="card matrix-card">
        <table className="matrix">
          <thead>
            <tr>
              <th scope="col">Can…</th>
              {roles.map((r) => <th key={r} scope="col">{cap(r)}</th>)}
            </tr>
          </thead>
          <tbody>
            {permissions.map((p) => (
              <tr key={p.key}>
                <th scope="row">{p.label}</th>
                {roles.map((r) => (
                  <td key={r}>
                    <Toggle label={`${cap(r)}: ${p.label}`} checked={!!draft[r]?.[p.key]} onChange={(v) => flip(r, p.key, v)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {save.error && <p className="banner err" role="alert">{save.error.message}</p>}
      {saved && !dirty && <p className="banner ok" role="status">Access saved.</p>}
      <div className="savebar" data-dirty={dirty}>
        <span className="muted">{dirty ? 'You have unsaved changes' : 'Everything is saved'}</span>
        <button type="button" className="btn btn-ghost" disabled={!dirty || save.isPending} onClick={() => setDraft(clone(matrix))}>Discard</button>
        <button type="button" className="btn btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
