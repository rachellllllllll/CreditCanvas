/**
 * ColorPalettePicker — Reusable color picker with preset palette + custom option.
 * Style inspired by Google Calendar / Apple Reminders.
 */
import React, { useRef } from 'react';
import './ColorPalettePicker.css';

// 6×3 grid organized by hue family: red, orange, yellow, green, blue, purple
// Row order: normal → dark → light (most useful first)
export const COLOR_PALETTE = [
  // Row 1 — Normal
  '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#3498DB', '#9B59B6',
  // Row 2 — Dark
  '#922B21', '#AF601A', '#B7950B', '#1E8449', '#1F618D', '#6C3483',
  // Row 3 — Light
  '#F1948A', '#F0B27A', '#F9E154', '#82E0AA', '#85C1E9', '#C39BD3',
];

interface ColorPalettePickerProps {
  value: string;
  onChange: (color: string) => void;
  /** Show label above the palette (default: true) */
  showLabel?: boolean;
  /** Label text */
  label?: string;
  /** Compact mode — smaller circles, no label (for inline use) */
  compact?: boolean;
}

const ColorPalettePicker: React.FC<ColorPalettePickerProps> = ({
  value,
  onChange,
  showLabel = true,
  label = 'צבע',
  compact = false,
}) => {
  const customInputRef = useRef<HTMLInputElement>(null);

  const isCustom = !COLOR_PALETTE.includes(value);

  return (
    <div className={`ColorPalettePicker${compact ? ' compact' : ''}`}>
      {showLabel && (
        <label className="ColorPalettePicker-label">{label}</label>
      )}
      <div className="ColorPalettePicker-grid">
        {COLOR_PALETTE.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`ColorPalettePicker-swatch${c === value ? ' selected' : ''}`}
            style={{ backgroundColor: c }}
            title={c}
            aria-label={`צבע ${c}`}
          />
        ))}
        {/* Custom color button — full width */}
        <button
          type="button"
          onClick={() => customInputRef.current?.click()}
          className={`ColorPalettePicker-custom-btn${isCustom ? ' selected' : ''}`}
          title="צבע מותאם אישית"
          aria-label="בחר צבע מותאם אישית"
        >
          {isCustom && (
            <span className="ColorPalettePicker-custom-preview" style={{ backgroundColor: value }} />
          )}
          <span>🎨 צבע מותאם אישית</span>
        </button>
        <input
          ref={customInputRef}
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="ColorPalettePicker-hidden-input"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

export default ColorPalettePicker;
