import { useState } from 'react';
import { Clock } from 'lucide-react';
import {
  getTimeFormatPreference, setTimeFormatPreference, sampleDeviceTime, isDevice24HourClock
} from '../utils/dateTime';

const TIME_FORMAT_OPTIONS = [
  ['auto', 'Automatic'],
  ['12', '12-hour'],
  ['24', '24-hour']
];

/**
 * App display preferences.
 *
 * Time format is a real preference rather than pure detection: browsers expose
 * the locale's clock convention, never the operating system's 24-hour toggle,
 * so a device set to 12-hour under an en-GB locale would otherwise always show
 * 13:40. 'Automatic' follows the locale; the other two override it.
 */
export default function AppPreferencesSection() {
  const [timeFormat, setTimeFormat] = useState(getTimeFormatPreference);

  const applyTimeFormat = value => {
    setTimeFormat(setTimeFormatPreference(value));
  };

  return (
    <div className="settings-list-group">
      <p className="settings-group-label">Display</p>

      <div className="settings-row settings-row-stacked">
        <span className="settings-row-icon"><Clock size={18} /></span>
        <span className="settings-row-copy">
          <strong>Time format</strong>
          <small>
            {timeFormat === 'auto'
              ? `Following this device's language (${isDevice24HourClock() ? '24-hour' : '12-hour'})`
              : 'Overriding the device language setting'}
            {' · '}Times show as {sampleDeviceTime()}
          </small>
        </span>
        <span className="settings-segmented" role="radiogroup" aria-label="Time format">
          {TIME_FORMAT_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={timeFormat === value}
              className={timeFormat === value ? 'active' : ''}
              onClick={() => applyTimeFormat(value)}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
