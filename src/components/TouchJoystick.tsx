import React, { useRef, useState } from 'react';
import { DITHER_PALETTES, DitherPaletteId, TouchMoveVector } from '../types/tour';

interface TouchJoystickProps {
  paletteId: DitherPaletteId;
  touchMoveRef: React.MutableRefObject<TouchMoveVector>;
}

export const TouchJoystick: React.FC<TouchJoystickProps> = ({
  paletteId,
  touchMoveRef,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const activeTouchIdRef = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const pal = DITHER_PALETTES[paletteId];

  const MAX_RADIUS = 38;

  const updateFromClientPos = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_RADIUS) {
      dx = (dx / dist) * MAX_RADIUS;
      dy = (dy / dist) * MAX_RADIUS;
    }
    setKnobOffset({ x: dx, y: dy });
    // Screen Y down is backward (-1), screen Y up is forward (+1)
    touchMoveRef.current = {
      x: dx / MAX_RADIUS,
      y: -dy / MAX_RADIUS,
    };
  };

  const resetStick = () => {
    activeTouchIdRef.current = null;
    setKnobOffset({ x: 0, y: 0 });
    touchMoveRef.current = { x: 0, y: 0 };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    activeTouchIdRef.current = touch.identifier;
    updateFromClientPos(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === activeTouchIdRef.current) {
        updateFromClientPos(t.clientX, t.clientY);
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchIdRef.current) {
        resetStick();
        break;
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientPos(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (e.buttons !== 1) return;
    e.stopPropagation();
    updateFromClientPos(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    e.stopPropagation();
    resetStick();
  };

  return (
    <div
      className="pointer-events-auto select-none flex flex-col items-center gap-1.5"
      style={{ color: pal.lightHex }}
    >
      <div
        ref={padRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="application"
        aria-label="Touch movement joystick"
        className="relative w-24 h-24 rounded-full flex items-center justify-center touch-none cursor-pointer"
        style={{
          backgroundColor: pal.darkHex,
          border: `2px solid ${pal.lightHex}`,
        }}
      >
        {/* Crosshair guides */}
        <span
          className="absolute w-full h-px opacity-25 pointer-events-none"
          style={{ backgroundColor: pal.lightHex }}
        />
        <span
          className="absolute h-full w-px opacity-25 pointer-events-none"
          style={{ backgroundColor: pal.lightHex }}
        />

        {/* Tactile thumb knob */}
        <div
          className="w-9 h-9 rounded-full pointer-events-none transition-transform duration-75"
          style={{
            backgroundColor: pal.lightHex,
            border: `2px solid ${pal.darkHex}`,
            transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
          }}
        />
      </div>
    </div>
  );
};
