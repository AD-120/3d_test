import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MonolithTourCanvas,
  TourControllerApi,
} from './components/MonolithTourCanvas';
import { TourHUD } from './components/TourHUD';
import {
  DITHER_PALETTES,
  TouchMoveVector,
  TourSettings,
  TourTelemetry,
} from './types/tour';

export default function App() {
  const [settings, setSettings] = useState<TourSettings>({
    palette: 'blueprint',
    ditherMode: 'bayer4',
    pixelSize: 2,
    contrast: 1.15,
    sunElevationDeg: -3,
    sunAutoOrbit: true,
    beaconEnabled: true,
    lanternEnabled: true,
    soundEnabled: false,
  });

  const [telemetry, setTelemetry] = useState<TourTelemetry>({
    fov: 88,
    distanceToMonolith: 9.2,
    headingDeg: 0,
    sunAzimuthDeg: 42,
    isPointerLocked: false,
    webglError: null,
  });

  const [dockOpen, setDockOpen] = useState<boolean>(false);
  const [showTouchStick, setShowTouchStick] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768
    );
  });

  const touchMoveRef = useRef<TouchMoveVector>({ x: 0, y: 0 });
  const apiRef = useRef<TourControllerApi | null>(null);

  const handleUpdateSettings = useCallback((patch: Partial<TourSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === 'KeyF') {
        setSettings((prev) => ({ ...prev, lanternEnabled: !prev.lanternEnabled }));
      } else if (e.code === 'KeyH') {
        setDockOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const pal = DITHER_PALETTES[settings.palette];

  if (telemetry.webglError) {
    return (
      <main
        className="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-4"
        style={{ backgroundColor: pal.darkHex, color: pal.lightHex }}
      >
        <img
          src="/assets/aistudio/rock_2_69294a23.png"
          alt="Monolith rock sculpture"
          referrerPolicy="no-referrer"
          className="w-40 h-40 object-contain"
        />
        <h1 className="text-xl font-bold">Monolith Tour — 1-Bit Dither</h1>
        <p className="text-sm opacity-85 max-w-md">{telemetry.webglError}</p>
      </main>
    );
  }

  return (
    <main
      className="relative w-full h-full overflow-hidden select-none"
      style={{ backgroundColor: pal.darkHex }}
    >
      <MonolithTourCanvas
        settings={settings}
        touchMoveRef={touchMoveRef}
        onTelemetry={setTelemetry}
        apiRef={apiRef}
      />

      <TourHUD
        settings={settings}
        telemetry={telemetry}
        dockOpen={dockOpen}
        showTouchStick={showTouchStick}
        touchMoveRef={touchMoveRef}
        onToggleDock={() => setDockOpen((v) => !v)}
        onToggleTouchStick={() => setShowTouchStick((v) => !v)}
        onUpdateSettings={handleUpdateSettings}
        onResetView={() => apiRef.current?.resetView()}
        onTogglePointerLock={() => apiRef.current?.togglePointerLock()}
        onFovChange={(fov) => apiRef.current?.setTargetFov(fov)}
      />
    </main>
  );
}
