import React, { useState } from 'react';
import {
  Compass,
  Flashlight,
  Gamepad2,
  Lock,
  RotateCcw,
  Settings,
  Sun,
  Unlock,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  DITHER_PALETTES,
  DitherMode,
  DitherPaletteId,
  TouchMoveVector,
  TourSettings,
  TourTelemetry,
} from '../types/tour';
import { TouchJoystick } from './TouchJoystick';

interface TourHUDProps {
  settings: TourSettings;
  telemetry: TourTelemetry;
  dockOpen: boolean;
  showTouchStick: boolean;
  touchMoveRef: React.MutableRefObject<TouchMoveVector>;
  onToggleDock: () => void;
  onToggleTouchStick: () => void;
  onUpdateSettings: (patch: Partial<TourSettings>) => void;
  onResetView: () => void;
  onTogglePointerLock: () => void;
  onFovChange: (fov: number) => void;
}

type DockTab = 'render' | 'lighting';

export const TourHUD: React.FC<TourHUDProps> = ({
  settings,
  telemetry,
  dockOpen,
  showTouchStick,
  touchMoveRef,
  onToggleDock,
  onToggleTouchStick,
  onUpdateSettings,
  onResetView,
  onTogglePointerLock,
  onFovChange,
}) => {
  const [activeTab, setActiveTab] = useState<DockTab>('render');
  const pal = DITHER_PALETTES[settings.palette];

  const boxStyle: React.CSSProperties = {
    backgroundColor: pal.darkHex,
    color: pal.lightHex,
    border: `1.5px solid ${pal.lightHex}`,
    ['--dock-bg' as string]: pal.darkHex,
  };

  const activeBtnStyle: React.CSSProperties = {
    backgroundColor: pal.lightHex,
    color: pal.darkHex,
    border: `1px solid ${pal.lightHex}`,
  };

  const idleBtnStyle: React.CSSProperties = {
    backgroundColor: 'transparent',
    color: pal.lightHex,
    border: `1px solid ${pal.lightHex}`,
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Small gear icon on the right side opens/closes edit mode — zero text on entry */}
      <div className="flex items-start justify-end w-full">
        <button
          type="button"
          onClick={onToggleDock}
          className="pointer-events-auto w-9 h-9 flex items-center justify-center cursor-pointer transition-opacity hover:opacity-85 shrink-0"
          style={dockOpen ? activeBtnStyle : boxStyle}
          title={dockOpen ? 'Close settings' : 'Open settings'}
          aria-label={dockOpen ? 'Close settings' : 'Open settings'}
          aria-expanded={dockOpen}
        >
          {dockOpen ? <X size={16} /> : <Settings size={16} />}
        </button>
      </div>

      {/* Bottom Area: Touch Stick (Left) + Edit Panel Dock (Center, only when gear is toggled open) */}
      <div className="relative flex items-end justify-center w-full">
        {showTouchStick && (
          <div className="fixed bottom-4 left-4 z-20 sm:bottom-6 sm:left-6">
            <TouchJoystick
              paletteId={settings.palette}
              touchMoveRef={touchMoveRef}
            />
          </div>
        )}

        {dockOpen && (
          <div
            className="pointer-events-auto flex flex-col items-center w-full"
            style={{ maxWidth: 'min(780px, 94vw)' }}
          >
            <div className="w-full p-3 flex flex-col gap-3" style={boxStyle}>
              {/* Header row: Tabs + Telemetry + Quick Actions */}
              <div
                className="flex flex-wrap items-center justify-between gap-2 pb-2"
                style={{ borderBottom: `1px solid ${pal.lightHex}33` }}
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('render')}
                    className="px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
                    style={activeTab === 'render' ? activeBtnStyle : idleBtnStyle}
                  >
                    Dither & Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('lighting')}
                    className="px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
                    style={
                      activeTab === 'lighting' ? activeBtnStyle : idleBtnStyle
                    }
                  >
                    Dynamic Lighting
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-mono-tabular opacity-80 whitespace-nowrap">
                  <span>Dist {telemetry.distanceToMonolith.toFixed(1)}m</span>
                  <span aria-hidden="true">·</span>
                  <span>FOV {telemetry.fov}°</span>
                  <span aria-hidden="true" className="hidden sm:inline">
                    ·
                  </span>
                  <span className="hidden sm:inline">
                    Hdg {telemetry.headingDeg}°
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({ lanternEnabled: !settings.lanternEnabled })
                    }
                    className="px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    style={settings.lanternEnabled ? activeBtnStyle : idleBtnStyle}
                    title="Toggle handheld lantern (F)"
                  >
                    <Flashlight size={13} />
                    <span>Lantern [F]</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({ soundEnabled: !settings.soundEnabled })
                    }
                    className="px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    style={settings.soundEnabled ? activeBtnStyle : idleBtnStyle}
                    title="Toggle ambient audio"
                  >
                    {settings.soundEnabled ? (
                      <Volume2 size={13} />
                    ) : (
                      <VolumeX size={13} />
                    )}
                    <span className="hidden sm:inline">
                      {settings.soundEnabled ? 'Audio On' : 'Audio Off'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={onTogglePointerLock}
                    className="hidden sm:flex px-2.5 py-1.5 text-xs font-medium items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    style={
                      telemetry.isPointerLocked ? activeBtnStyle : idleBtnStyle
                    }
                    title="Lock cursor for FPS look (L)"
                  >
                    {telemetry.isPointerLocked ? (
                      <Lock size={13} />
                    ) : (
                      <Unlock size={13} />
                    )}
                    <span>
                      {telemetry.isPointerLocked ? 'Locked' : 'FPS Look'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleTouchStick}
                    className="px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    style={showTouchStick ? activeBtnStyle : idleBtnStyle}
                    title="Toggle on-screen touch joystick"
                  >
                    <Gamepad2 size={13} />
                    <span className="hidden sm:inline">Touch Pad</span>
                  </button>

                  <button
                    type="button"
                    onClick={onResetView}
                    className="px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    style={idleBtnStyle}
                    title="Reset position (R)"
                  >
                    <RotateCcw size={13} />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {/* Tab 1: Dither Shader & Camera Depth */}
              {activeTab === 'render' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                  {/* Palette Selector */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] opacity-80">1-Bit Palette</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(Object.keys(DITHER_PALETTES) as DitherPaletteId[]).map(
                        (id) => {
                          const p = DITHER_PALETTES[id];
                          const isSelected = settings.palette === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => onUpdateSettings({ palette: id })}
                              className="px-2 py-1 text-[11px] font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                              style={isSelected ? activeBtnStyle : idleBtnStyle}
                            >
                              <span
                                className="inline-block w-2.5 h-2.5"
                                style={{
                                  backgroundColor: p.lightHex,
                                  border: `1px solid ${p.darkHex}`,
                                }}
                              />
                              <span>{p.label}</span>
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>

                  {/* Dither Matrix & Pixel Scale */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] opacity-80">
                      Pattern & Pixel Size
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {(
                        [
                          { id: 'bayer8', label: 'Bayer 8×8' },
                          { id: 'bayer4', label: 'Bayer 4×4' },
                          { id: 'hatch', label: 'Engraving' },
                        ] as { id: DitherMode; label: string }[]
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onUpdateSettings({ ditherMode: m.id })}
                          className="px-2 py-1 text-[11px] font-medium cursor-pointer whitespace-nowrap shrink-0"
                          style={
                            settings.ditherMode === m.id
                              ? activeBtnStyle
                              : idleBtnStyle
                          }
                        >
                          {m.label}
                        </button>
                      ))}

                      {[1, 2, 3].map((px) => (
                        <button
                          key={px}
                          type="button"
                          onClick={() => onUpdateSettings({ pixelSize: px })}
                          className="px-2 py-1 text-[11px] font-mono-tabular cursor-pointer whitespace-nowrap shrink-0"
                          style={
                            settings.pixelSize === px
                              ? activeBtnStyle
                              : idleBtnStyle
                          }
                        >
                          {px}×
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Depth / FOV Slider */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="opacity-80">Field of View (Scroll)</span>
                      <span className="font-mono-tabular">{telemetry.fov}°</span>
                    </div>
                    <input
                      type="range"
                      min={26}
                      max={88}
                      step={1}
                      value={telemetry.fov}
                      onChange={(e) => onFovChange(Number(e.target.value))}
                      className="retro-slider w-full"
                      aria-label="Field of View"
                    />
                  </div>
                </div>
              )}

              {/* Tab 2: Dynamic Lighting */}
              {activeTab === 'lighting' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="opacity-80 flex items-center gap-1">
                        <Sun size={12} />
                        Sun Elevation
                      </span>
                      <span className="font-mono-tabular">
                        {settings.sunElevationDeg}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-10}
                      max={78}
                      step={1}
                      value={settings.sunElevationDeg}
                      onChange={(e) =>
                        onUpdateSettings({
                          sunElevationDeg: Number(e.target.value),
                        })
                      }
                      className="retro-slider w-full"
                      aria-label="Sun Elevation"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="opacity-80">Dither Contrast</span>
                      <span className="font-mono-tabular">
                        {settings.contrast.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.75}
                      max={1.65}
                      step={0.05}
                      value={settings.contrast}
                      onChange={(e) =>
                        onUpdateSettings({ contrast: Number(e.target.value) })
                      }
                      className="retro-slider w-full"
                      aria-label="Dither Contrast"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings({ sunAutoOrbit: !settings.sunAutoOrbit })
                      }
                      className="px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                      style={settings.sunAutoOrbit ? activeBtnStyle : idleBtnStyle}
                    >
                      <Compass size={13} />
                      <span>Orbiting Sun</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          beaconEnabled: !settings.beaconEnabled,
                        })
                      }
                      className="px-2.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
                      style={settings.beaconEnabled ? activeBtnStyle : idleBtnStyle}
                    >
                      Orbiting Beacon
                    </button>
                  </div>
                </div>
              )}

              {/* Controls Legend */}
              <div
                className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] opacity-75 pt-1"
                style={{ borderTop: `1px solid ${pal.lightHex}22` }}
              >
                <span>WASD / Arrows: Walk</span>
                <span aria-hidden="true">·</span>
                <span>Drag: Look 360°</span>
                <span aria-hidden="true">·</span>
                <span>Scroll / Pinch: FOV</span>
                <span aria-hidden="true">·</span>
                <span className="hidden sm:inline">Shift: Sprint</span>
                <span aria-hidden="true" className="hidden sm:inline">
                  ·
                </span>
                <span className="hidden sm:inline">H: Toggle Panel</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
