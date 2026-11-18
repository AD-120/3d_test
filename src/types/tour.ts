export type DitherPaletteId = 'paper' | 'amber' | 'phosphor' | 'blueprint';

export type DitherMode = 'bayer8' | 'bayer4' | 'hatch';

export interface DitherPalette {
  id: DitherPaletteId;
  label: string;
  darkHex: string;
  lightHex: string;
  darkRgb: [number, number, number]; // 0..1 sRGB
  lightRgb: [number, number, number]; // 0..1 sRGB
}

export const DITHER_PALETTES: Record<DitherPaletteId, DitherPalette> = {
  paper: {
    id: 'paper',
    label: 'Paper & Ink',
    darkHex: '#151513',
    lightHex: '#EAE5D7',
    darkRgb: [21 / 255, 21 / 255, 19 / 255],
    lightRgb: [234 / 255, 229 / 255, 215 / 255],
  },
  amber: {
    id: 'amber',
    label: 'CRT Amber',
    darkHex: '#130B03',
    lightHex: '#FFB636',
    darkRgb: [19 / 255, 11 / 255, 3 / 255],
    lightRgb: [255 / 255, 182 / 255, 54 / 255],
  },
  phosphor: {
    id: 'phosphor',
    label: 'Green Phosphor',
    darkHex: '#06130A',
    lightHex: '#63FF84',
    darkRgb: [6 / 255, 19 / 255, 10 / 255],
    lightRgb: [99 / 255, 255 / 255, 132 / 255],
  },
  blueprint: {
    id: 'blueprint',
    label: 'Cyanotype',
    darkHex: '#0A192F',
    lightHex: '#E2EEFF',
    darkRgb: [10 / 255, 25 / 255, 47 / 255],
    lightRgb: [226 / 255, 238 / 255, 255 / 255],
  },
};

export interface TourSettings {
  palette: DitherPaletteId;
  ditherMode: DitherMode;
  pixelSize: number; // 1 | 2 | 3
  contrast: number; // 0.8 .. 1.6
  sunElevationDeg: number; // -10 .. 78
  sunAutoOrbit: boolean;
  beaconEnabled: boolean;
  lanternEnabled: boolean;
  soundEnabled: boolean;
}

export interface TourTelemetry {
  fov: number;
  distanceToMonolith: number;
  headingDeg: number;
  sunAzimuthDeg: number;
  isPointerLocked: boolean;
  webglError: string | null;
}

export interface TouchMoveVector {
  x: number; // -1 (left) to 1 (right)
  y: number; // -1 (backward) to 1 (forward)
}
