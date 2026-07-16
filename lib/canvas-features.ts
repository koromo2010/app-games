export type CanvasFeatureFlags = {
  layers: boolean;
  fullscreen: boolean;
  fill: boolean;
  eyedropper: boolean;
  zoom: boolean;
  roomRecruitment: boolean;
};

export const canvasFeaturePresets = {
  lobbyBoard: {
    layers: false,
    fullscreen: true,
    fill: true,
    eyedropper: true,
    zoom: true,
    roomRecruitment: true,
  },
  collaborativeRoom: {
    layers: true,
    fullscreen: true,
    fill: true,
    eyedropper: true,
    zoom: true,
    roomRecruitment: true,
  },
} satisfies Record<string, CanvasFeatureFlags>;

export type CanvasFeaturePreset = keyof typeof canvasFeaturePresets;

export function canvasFeatures(preset: CanvasFeaturePreset, overrides: Partial<CanvasFeatureFlags> = {}) {
  return { ...canvasFeaturePresets[preset], ...overrides };
}
