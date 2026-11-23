from pathlib import Path
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1]; web=root/'web'
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((web/'index.html').read_text('utf-8'))
 page.add_style_tag(content=(web/'styles.css').read_text('utf-8'))
 page.add_script_tag(content=(web/'js/engine.js').read_text('utf-8'))
 page.add_script_tag(content=(web/'js/app.js').read_text('utf-8'))
 page.locator('.intro-style-row button[data-style="drama"]').click()
 page.screenshot(path=str(root/'qa_drama_intro_v12.png'))
 page.locator('[data-mode="easy"]').click()
 page.locator(f'[data-answer="{page.evaluate("window.WolfMathDebug.getState().question.answer")}"]').click()
 page.evaluate('''() => {const s=window.WolfMathDebug.getState();s.wood=20;s.stone=20;s.coins=20;s.actions=2;s.selectedRing=1;s.wolves[0].ring=2;window.WolfMathDebug.setState(s);}''')
 page.locator('[data-action="tower"]').click()
 page.locator('[data-action="net"]').click()
 page.screenshot(path=str(root/'qa_drama_defense_desktop_v12.png'),full_page=True)
 page.locator('.style-toolbar button[data-style="classic"]').click()
 page.screenshot(path=str(root/'qa_classic_defense_desktop_v12.png'),full_page=True)
 print('Desktop gameplay and intro screenshots, JS errors=', errors)
 browser.close()
