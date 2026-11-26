import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const fontDir = dirname(require.resolve('@expo-google-fonts/manrope/package.json'));
const fontFiles = ['400Regular', '500Medium', '600SemiBold', '700Bold', '800ExtraBold'].map((name) =>
  join(fontDir, name, `Manrope_${name}.ttf`),
);

/** Telegram keeps photos up to this size on the long side, so that's what there is to zoom into. */
const LONG_SIDE = 2560;

/** Renders a dashboard SVG to a PNG whose long side is 2560 px. */
export function toPng(svg: string): Buffer {
  const [, width, height] = svg.match(/width="([\d.]+)" height="([\d.]+)"/)!.map(Number);
  const resvg = new Resvg(svg, {
    fitTo: width >= height ? { mode: 'width', value: LONG_SIDE } : { mode: 'height', value: LONG_SIDE },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Manrope' },
  });
  return resvg.render().asPng();
}
