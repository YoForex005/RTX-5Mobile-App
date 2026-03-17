import os

file_path = 'src/features/chart/ChartScreen.web.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Inject Constants
if 'const CHART_HEADER_BG = isDark ?' not in content:
    content = content.replace(
        "  const CARD_BG = isDark ? '#0B0F19' : T.glass2;",
        "  const CARD_BG = isDark ? '#0B0F19' : T.glass2;\n  const CHART_HEADER_BG = isDark ? '#0B101E' : '#FFFFFF';\n  const CHART_HEADER_BORDER = isDark ? '#1E293B' : '#E2E8F0';\n  const CHART_CANVAS_BG = isDark ? '#0B101E' : '#FFFFFF';\n  const BOTTOM_AREA_BG = isDark ? '#0B0F19' : '#FFFFFF';"
    )

# APP_BG
content = content.replace("const APP_BG = T.bg;", "const APP_BG = isDark ? T.bg : '#FFFFFF';")

# 2. Fix glassToolbar
content = content.replace("backgroundColor: '#0d1220'", "backgroundColor: CHART_HEADER_BG")
content = content.replace("borderColor: '#1e2640'", "borderColor: CHART_HEADER_BORDER")

# 3. Text & Metric Overrides
content = content.replace("color: '#FFFFFF',", "color: isDark ? '#FFFFFF' : '#0F172A',")
content = content.replace("color: T.text,", "color: isDark ? '#FFFFFF' : '#0F172A',")

# Special Cases
content = content.replace("color: 'rgba(255,255,255,0.6)',", "color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B',")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('ChartScreen.web.tsx layout blocks successfully overwritten.')
