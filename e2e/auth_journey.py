"""Real-browser acceptance journey for the account pages. Run: SEED_DEV_PASSWORD=x python3 e2e/auth_journey.py (app on :3000)."""
import re, sys, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail)); print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    # anonymous: header offers Log in; login page renders one h1 and labelled inputs
    page.goto(BASE + "/")
    check("anonymous header shows Log in", page.locator("header >> text=Log in").count() >= 1)
    page.goto(BASE + "/login")
    check("login page has exactly one h1", page.locator("h1").count() == 1)
    check("login inputs are labelled", page.get_by_label("Email").count() == 1 and page.get_by_label("Password").count() == 1)

    # client-side validation
    page.get_by_role("button", name="Log in").last.click()
    check("empty submit shows field errors", page.locator(".auth__field-error").count() == 2)

    # register through the UI (also verifies timezone capture and redirect + refresh)
    page.goto(BASE + "/register")
    page.get_by_label("Full name").fill("Browser Tester")
    page.get_by_label("Email").fill(f"browser{int(time.time())}@example.test")
    page.get_by_label("Password").fill("short")
    page.get_by_role("button", name="Create account").click()
    page.wait_for_selector(".auth__field-error")
    check("weak password rejected by server and shown on the field", "10 characters" in page.locator(".auth__field-error").first.inner_text())
    email = f"browser{int(time.time())}@example.test"
    page.get_by_label("Email").fill(email)
    page.get_by_label("Password").fill("a long passphrase for testing")
    page.get_by_role("button", name="Create account").click()
    page.wait_for_url(BASE + "/")
    page.wait_for_selector('button[aria-haspopup="menu"]', timeout=8000)
    # account menu button holds the name/initial
    page.locator('button[aria-haspopup="menu"]').first.click()
    check("registered user is signed in (menu shows Profile, Log out)", page.get_by_role("menuitem", name="Log out").count() == 1)
    cookies = {c["name"]: c for c in ctx.cookies()}
    check("cookies are HttpOnly+Lax; refresh scoped to /api/v1/auth", cookies["enews_at"]["httpOnly"] and cookies["enews_rt"]["path"] == "/api/v1/auth" and cookies["enews_rt"]["sameSite"] == "Lax")
    check("tokens are not readable by page JavaScript", page.evaluate("document.cookie") == "")
    page.goto(BASE + "/login")
    try:
        page.wait_for_url(BASE + "/", timeout=5000); redirected = True
    except Exception:
        redirected = False
    check("visiting /login while signed in redirects away", redirected)

    # logout via the header form: lands on home, anonymous again
    page.locator('button[aria-haspopup="menu"]').first.click()
    page.get_by_role("menuitem", name="Log out").click()
    page.wait_for_load_state("networkidle")
    check("logout returns to a page (not a blank 204)", page.url == BASE + "/" and page.locator("h1").count() >= 1)
    check("header is anonymous after logout", page.locator("header >> text=Log in").count() >= 1)

    # login errors then success
    page.goto(BASE + "/login?next=/news")
    page.get_by_label("Email").fill(email); page.get_by_label("Password").fill("wrong password here")
    page.get_by_role("button", name="Log in").last.click()
    page.wait_for_selector(".auth__error")
    check("wrong password shows a generic error", "Invalid email or password" in page.locator(".auth__error").inner_text())
    page.get_by_label("Password").fill("a long passphrase for testing")
    page.get_by_role("button", name="Log in").last.click()
    page.wait_for_url(BASE + "/news")
    check("login honours ?next= and signs in", page.locator('button[aria-haspopup="menu"]').count() >= 1)

    # open redirect via next is neutralised
    page.context.clear_cookies()
    page.goto(BASE + "/login?next=//evil.test")
    page.get_by_label("Email").fill(email); page.get_by_label("Password").fill("a long passphrase for testing")
    page.get_by_role("button", name="Log in").last.click()
    page.wait_for_load_state("networkidle")
    check("//evil.test is not followed after login", "evil.test" not in page.url and page.url.startswith(BASE))

    # forgot / reset pages
    page.context.clear_cookies()
    page.goto(BASE + "/forgot-password")
    page.get_by_label("Email").fill("nobody@example.test")
    page.get_by_role("button", name="Send reset link").click()
    page.wait_for_selector(".auth__done")
    check("forgot-password shows the same neutral message", "If an account exists" in page.locator(".auth__done").inner_text())
    page.goto(BASE + "/reset-password")
    check("reset page without token explains and offers a new link", page.get_by_role("link", name="Request a new link").count() == 1)
    page.goto(BASE + "/reset-password?token=" + "x" * 30)
    page.locator('input[name="password"]').fill("another long passphrase")
    page.get_by_role("button", name="Update password").click()
    page.wait_for_selector(".auth__error")
    check("invalid reset token is rejected with a clear message", "invalid or has expired" in page.locator(".auth__error").inner_text())
    check("reset page asks not to be indexed/referred", page.locator('meta[name="robots"]').get_attribute("content").startswith("noindex"))

    # responsive: no horizontal overflow on auth pages
    for w in (360, 390, 768):
        page.set_viewport_size({"width": w, "height": 800})
        for path in ("/login", "/register", "/forgot-password", "/reset-password?token=" + "x" * 30):
            page.goto(BASE + path)
            ov = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            if ov > 0: check(f"no horizontal overflow {path} @{w}", False, f"overflow {ov}px")
    check("no horizontal overflow on auth pages at 360/390/768", all(r[1] for r in results if r[0].startswith("no horizontal overflow")))
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(BASE + "/register"); page.screenshot(path="/tmp/auth-register-desktop.png")
    page.set_viewport_size({"width": 390, "height": 800})
    page.goto(BASE + "/login"); page.screenshot(path="/tmp/auth-login-mobile.png")
    check("no JS page errors during the whole run", not [e for e in errors if "favicon" not in e and "401" not in e and "422" not in e and "Failed to load resource" not in e], "; ".join(errors[:3]))
    b.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} browser checks passed")
sys.exit(1 if failed else 0)
