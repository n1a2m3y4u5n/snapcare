"""공식 양식 판형용 도판. 머리띠의 남보라(#40498C)를 기본색으로."""
import os, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent / 'proposal' / 'tools'
OUT = HERE / 'fig_tpl'; OUT.mkdir(exist_ok=True)
os.environ['SNAPCARE_LANG'] = 'en'
sys.path.insert(0, str(TOOLS))
import style
style.BLUE='#40498C'; style.ORANGE='#D64545'; style.GREY='#B9BDCE'; style.LIGHT='#D9DCE8'
style.DARK='#2E3454'; style.GREEN='#40498C'; style.RED='#D64545'; style.GOLD='#D64545'
style.INK, style.MUTED = '#20243A', '#5A6079'
style.GRIDC, style.SPINE = '#DFE2EC', '#9AA0B8'
style.FIG = OUT
style.plt.rcParams.update({
    'font.family': ['Pretendard', 'Arial', 'Helvetica'],
    'font.size': 13.0, 'axes.labelsize': 13.4,
    'xtick.labelsize': 12.6, 'ytick.labelsize': 12.6, 'legend.fontsize': 12.6,
    'text.color': style.INK, 'axes.labelcolor': style.INK,
    'axes.edgecolor': style.SPINE, 'axes.linewidth': 1.2,
    'xtick.color': style.MUTED, 'ytick.color': style.MUTED,
})
import i18n
i18n.EN['파랑 = 현지 제작 · 회색 = 국제 표준 · 주황 = 본 연구'] = \
    'blue = locally made · grey = international standard · red = this work'
# A0 에서 크게 쓰려고 글자를 키웠더니 축 라벨이 그림판 밖으로 나간다. 라벨을 줄인다.
i18n.EN['Gutierrez (2022)\nUSP+FIP 108종 · ANSI 85%'] = 'Gutierrez 2022\n108 symbols'
i18n.EN['Dowse & Ehlers (2001)\nUSP-DI 23종 · ANSI 85%'] = 'Dowse & Ehlers 2001\n23 symbols'
i18n.EN['같은 46명 · 현지 제작\n23종 · ANSI 85%'] = 'Same 46 people\nlocally made, 23'
i18n.EN['Dowse (2023)\n현지 제작 10종 · ISO 66.7%'] = 'Dowse 2023\nlocally made, 10'
i18n.EN['본 연구 SIGIL\n78종 · 기계 판정'] = 'This work, SIGIL\n78 morphemes'
import charts
for k in ('BLUE','ORANGE','GREY','LIGHT','DARK','GREEN','RED','GOLD','INK','MUTED','GRIDC','SPINE','FIG'):
    if hasattr(charts, k): setattr(charts, k, getattr(style, k))
for fn in (charts.chart_pictogram, charts.chart_eval, charts.chart_glyphs):
    fn(); print('  ', fn.__name__)
print('완료 →', OUT)
