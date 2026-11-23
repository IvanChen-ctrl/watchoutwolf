"""Optional touch-screen UI regression (requires Python playwright and Chromium).

Loads the exact shipped HTML/CSS/JS in about:blank, allowing tests even when
outbound browser navigation is blocked by the automation environment.
Run: python3 tests/test_browser.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        html = (WEB / 'index.html').read_text('utf-8')
        page.set_content(html, wait_until='domcontentloaded')
        page.evaluate("""() => {
            const data = {};
            Object.defineProperty(window, 'localStorage', {configurable:true, value: {
                getItem(k){return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null},
                setItem(k,v){data[k]=String(v)},removeItem(k){delete data[k]}
            }});
        }""")
        page.add_style_tag(content=(WEB / 'styles.css').read_text('utf-8'))
        page.add_script_tag(content=(WEB / 'js/engine.js').read_text('utf-8'))
        page.add_script_tag(content=(WEB / 'js/app.js').read_text('utf-8'))
        assert page.locator('#introOverlay.visible').count() == 1
        page.locator('[data-mode="easy"]').click()
        save = lambda: page.evaluate("JSON.parse(localStorage.getItem('wolf-math-defense-save-v1'))")
        assert page.locator('.answer-option').count() == 3
        ans = save()['question']['answer']
        page.locator(f'[data-answer]:not([data-answer="{ans}"])').first.click()
        assert page.locator('[data-action="skip"]').count() == 1
        page.locator('[data-action="skip"]').click()
        page.locator('[data-action="endturn"]').click()
        assert page.locator('.answer-option').count() == 3
        assert not errors, errors
        dims = page.evaluate('({scroll:document.documentElement.scrollWidth, width:innerWidth})')
        assert dims['scroll'] <= dims['width'] + 1, dims
        print('PASS mobile: wrong answer -> optional dice skip -> engineering -> next round')

        # Four correct questions in a row grant flashlight; keep 4th at defend phase.
        for i in range(4):
            page.locator(f'[data-answer="{save()["question"]["answer"]}"]').click()
            assert save()['phase'] == 'defend'
            if i != 3:
                page.locator('[data-action="endturn"]').click()
        assert save()['charges'] >= 1
        wolf_ids = [w['id'] for w in save()['wolves'] if w['kind'] != 'dog']
        assert len(wolf_ids) >= 2, wolf_ids
        before = next(w for w in save()['wolves'] if w['id'] == wolf_ids[1])['ring']
        page.locator(f'[data-wolf="{wolf_ids[0]}"]').click()
        second = wolf_ids[1]
        page.locator(f'[data-directflash="{second}"]').click()
        state = save()
        assert next(w for w in state['wolves'] if w['id'] == second)['kind'] == 'dog'
        assert next(w for w in state['wolves'] if w['id'] == second)['ring'] == max(0,before-1)
        assert next(w for w in state['wolves'] if w['id'] == wolf_ids[0])['kind'] != 'dog'
        print('PASS direct flashlight targets clicked wolf and retreats exactly one ring')
        assert not errors, errors
        page.set_viewport_size({'width': 320, 'height': 740})
        page.wait_for_timeout(250)
        dims = page.evaluate('({scroll:document.documentElement.scrollWidth, width:innerWidth})')
        assert dims['scroll'] <= dims['width'] + 1, dims
        print('PASS 320px mobile layout: no horizontal overflow / JS exceptions')
        browser.close()


if __name__ == '__main__':
    run()
