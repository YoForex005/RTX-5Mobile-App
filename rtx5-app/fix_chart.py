import os
import re

file_path = 'src/features/chart/ChartScreen.native.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix glassToolbar
content = content.replace("backgroundColor: '#0d1220',", "backgroundColor: CARD_BG,")
content = content.replace("borderColor: '#1e2640',", "borderColor: GRID,")
content = content.replace("shadowColor: '#2563EB',", "shadowColor: isDark ? '#2563EB' : '#0F172A',")
content = content.replace("shadowOpacity: 0.05,", "shadowOpacity: isDark ? 0.05 : 0.02,")
content = content.replace("elevation: 4,", "elevation: isDark ? 4 : 0,")

# 2. Fix actionBtnSell
content = content.replace("backgroundColor: 'rgba(255, 42, 85, 0.1)', // Subtle red tint", "backgroundColor: isDark ? 'rgba(255, 42, 85, 0.1)' : 'rgba(220, 38, 38, 0.05)', // Subtle red tint")
content = content.replace("borderColor: 'rgba(255, 42, 85, 0.25)',", "borderColor: isDark ? 'rgba(255, 42, 85, 0.25)' : 'rgba(220, 38, 38, 0.2)',")

# 3. Fix actionBtnBuy
content = content.replace("backgroundColor: 'rgba(41, 98, 255, 0.1)', // Subtle blue tint", "backgroundColor: isDark ? 'rgba(41, 98, 255, 0.1)' : 'rgba(37, 99, 235, 0.05)', // Subtle blue tint")
content = content.replace("borderColor: 'rgba(41, 98, 255, 0.25)',", "borderColor: isDark ? 'rgba(41, 98, 255, 0.25)' : 'rgba(37, 99, 235, 0.2)',")

# 4. Fix both elevation: 2 for action buttons
content = re.sub(r"elevation: 2,", "elevation: isDark ? 2 : 0,", content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('ChartScreen.native.tsx successfully updated via Python script.')
