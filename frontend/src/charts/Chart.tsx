/** Enveloppe ECharts : import modulaire (taille du bundle), thème clair/sombre de theme.ts. */
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { useRef } from 'react';
import { INK } from '../theme';
import { useThemeMode } from '../useThemeMode';
import { baseOption, csvFromOption, fileSlug, mergeOption } from './base';

echarts.use([
  LineChart,
  BarChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  MarkAreaComponent,
  DataZoomComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

interface Props {
  option: EChartsOption;
  height?: number;
  ariaLabel: string;
}

function download(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function Chart({ option, height = 320, ariaLabel }: Props) {
  const mode = useThemeMode();
  const ref = useRef<ReactEChartsCore>(null);
  const merged = mergeOption(baseOption(mode), option);
  const name = fileSlug(ariaLabel) || 'graphique';

  const exportPng = () => {
    const inst = ref.current?.getEchartsInstance();
    if (!inst) return;
    download(
      inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: INK[mode].surface }),
      `${name}.png`,
    );
  };
  const csv = csvFromOption(merged);
  const exportCsv = () => {
    if (!csv) return;
    // BOM UTF-8 : accents corrects à l'ouverture dans Excel
    const url = URL.createObjectURL(
      new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }),
    );
    download(url, `${name}.csv`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="chart" role="img" aria-label={ariaLabel}>
      <div className="chart-tools">
        <button type="button" className="btn small" onClick={exportPng} title="Télécharger l'image (PNG)">
          PNG
        </button>
        {csv && (
          <button
            type="button"
            className="btn small"
            onClick={exportCsv}
            title="Télécharger les données tracées (CSV)"
          >
            CSV
          </button>
        )}
      </div>
      <ReactEChartsCore
        ref={ref}
        echarts={echarts}
        option={merged}
        notMerge
        lazyUpdate
        style={{ height, width: '100%' }}
      />
    </div>
  );
}
