import React, { useState } from 'react';
import { ICONS } from './icons';
import type { CategoryDef } from './CategoryManager';

interface NewCategoryPromptProps {
  name: string;
  onConfirm: (cat: CategoryDef) => void;
  onCancel?: () => void;
}

const colorPalette = [
  '#36A2EB', '#FF6384', '#FFD966', '#4BC0C0', '#9966FF', '#FF9F40', '#B2FF66', '#FF66B2', '#66B2FF',
  '#FFB266', '#66FFB2', '#B266FF', '#FF6666', '#66FF66', '#6666FF', '#FFD966', '#A2EB36', '#CE56FF', '#40FF9F'
];

const NewCategoryPrompt: React.FC<NewCategoryPromptProps> = ({ name, onConfirm, onCancel }) => {
  const [icon, setIcon] = useState(ICONS[Math.floor(Math.random() * ICONS.length)]);
  const [color, setColor] = useState(colorPalette[Math.floor(Math.random() * colorPalette.length)]);
  return (
    <div className="edit-dialog-overlay">
      <div className="edit-dialog-box" style={{ minWidth: 340, maxWidth: 400 }}>
        <h3>נמצאה קטגוריה חדשה: "{name}"</h3>
        <div style={{ margin: '16px 0' }}>
          <div>האם להוסיף קטגוריה חדשה או לבחור קיימת?</div>
          <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>אייקון:</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 180 }}>
              {ICONS.map(ic => (
                <span
                  key={ic}
                  style={{ fontSize: 22, cursor: 'pointer', border: ic === icon ? '2px solid #36A2EB' : '1px solid #ccc', borderRadius: 6, padding: 2, background: ic === icon ? '#e3f2fd' : '#fff' }}
                  onClick={() => setIcon(ic)}
                >{ic}</span>
              ))}
            </div>
          </div>
          <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>צבע:</span>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 36, height: 36, border: 'none', borderRadius: 8 }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onCancel} style={{ padding: '10px 16px', borderRadius: 4, border: '1.5px solid #7ecbff', background: '#fff', color: '#36A2EB', fontWeight: 700, minWidth: 80 }}>ביטול</button>
          <button onClick={() => onConfirm({ name, icon, color })} style={{ padding: '10px 16px', borderRadius: 4, border: 'none', background: '#4CAF50', color: '#fff', fontWeight: 700, minWidth: 120 }}>הוסף קטגוריה חדשה</button>
        </div>
      </div>
    </div>
  );
};

export default NewCategoryPrompt;
