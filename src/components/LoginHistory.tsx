import React from 'react';
import { db, auth } from '../lib/firebaseClient';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';

type Row = { id: string; email?: string | null; logged_in_at?: Date | null };

const LoginHistory: React.FC = () => {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = async () => {
    if (!auth.currentUser) { setRows([]); return; }
    setLoading(true); setError(null);
    try {
      const q = query(
        collection(db, 'user_logins'),
        where('user_id', '==', auth.currentUser.uid),
        orderBy('logged_in_at', 'desc'),
        limit(20)
      );
      const snap = await getDocs(q);
      const items: Row[] = [];
      snap.forEach(doc => {
        const d: any = doc.data();
        const ts = d?.logged_in_at as Timestamp | undefined;
        items.push({
          id: doc.id,
          email: d?.email ?? auth.currentUser?.email,
          logged_in_at: ts ? ts.toDate() : null
        });
      });
      setRows(items);
    } catch (e: any) {
      setError(e?.message || 'שגיאה בטעינת היסטוריית כניסות');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: '8px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>היסטוריית כניסות</h3>
        <button onClick={load} style={{ padding: '6px 10px' }}>רענן</button>
      </div>
      {loading && <div>טוען...</div>}
      {error && <div style={{ color: '#b91c1c' }}>{error}</div>}
      {!loading && rows.length === 0 && <div>אין נתונים להצגה.</div>}
      {rows.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.map(r => (
            <li key={r.id} style={{
              display: 'flex', justifyContent: 'space-between', padding: '10px 12px',
              background: '#fff', border: '1px solid #e2e6f0', borderRadius: 10, marginBottom: 8
            }}>
              <span>{r.email || '-'}</span>
              <span>{r.logged_in_at ? r.logged_in_at.toLocaleString() : '-'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LoginHistory;
