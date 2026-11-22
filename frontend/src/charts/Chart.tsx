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
import { useThemeMode } from '../useThemeMode';
import { baseOption, mergeOption } from './base';

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

export function Chart({ option, height = 320, ariaLabel }: Props) {
  const mode = useThemeMode();
  const merged = mergeOption(baseOption(mode), option);
  return (
    <div role="img" aria-label={ariaLabel}>
      <ReactEChartsCore
        echarts={echarts}
        option={merged}
        notMerge
        lazyUpdate
        style={{ height, width: '100%' }}
      />
    </div>
  );
}
