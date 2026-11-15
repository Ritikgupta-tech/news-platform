"""
Real-browser acceptance journey for the reader features (Playwright for Python, Chromium).
Prerequisites: app on BASE, database seeded with `prisma db seed` (dev users + the [DEV SEED] articles are kept),
and 3 notifications for author@example.test (the runner script adds them).
Run: SEED_DEV_PASSWORD=... python3 e2e/reader_journey.py
"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3000")
PW = os.environ["SEED_DEV_PASSWORD"]
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""), flush=True)

def sign_in(pg, email, password, wait_for=None):
    pg.get_by_label("Email").fill(email); pg.get_by_label("Password").fill(password)
    pg.get_by_role("button", name="Log in").last.click()
    if wait_for: pg.wait_for_url(wait_for)
    pg.wait_for_selector('button[aria-haspopup="menu"]')

def login_ctx(browser, email, password=PW, viewport=None):
    ctx = browser.new_context(viewport=viewport or {"width": 1280, "height": 900}); pg = ctx.new_page()
    pg.goto(f"{BASE}/login"); sign_in(pg, email, password, f"{BASE}/")
    return ctx, pg

def bell(pg):
    pg.goto(BASE + "/"); return pg.locator('button[aria-label^="Notifications"]').first.get_attribute("aria-label")

with sync_playwright() as p:
    b = p.chromium.launch()
    errors = []
    anon_ctx = b.new_context(); anon = anon_ctx.new_page()
    anon.on("pageerror", lambda e: errors.append(str(e)))
    arts = anon.request.get(f"{BASE}/api/v1/articles?pageSize=3").json()["data"]
    a1, a2 = arts[0], arts[1]
    path1 = f"/news/{a1['slug']}"

    # ── anonymous visitors ──
    anon.goto(BASE + path1)
    check("anonymous reader is offered 'Log in to save'", anon.get_by_role("link", name="Log in to save").count() == 1)
    anon.wait_for_timeout(6000)
    check("nothing is recorded for anonymous readers", anon.request.get(f"{BASE}/api/v1/reading-history").status == 401)
    for page_path in ("/bookmarks", "/reading-history", "/preferences", "/notifications", "/profile"):
        anon.goto(BASE + page_path)
        try: anon.wait_for_url(re.compile(r"/login\?next="), timeout=6000); ok = True
        except Exception: ok = False
        check(f"anonymous visitor to {page_path} is sent to log in", ok)

    # ── log in from the article's own link, land back on it ──
    anon.goto(BASE + path1); anon.get_by_role("link", name="Log in to save").click()
    anon.wait_for_url(re.compile(r"/login\?next=")); sign_in(anon, "reader@example.test", PW, f"{BASE}{path1}")
    check("login brings the reader back to the article", anon.url == BASE + path1)
    btn = anon.locator(".bookmark button")
    check("signed-in reader sees an unpressed Save button", btn.count() == 1 and btn.get_attribute("aria-pressed") == "false")
    btn.click(); anon.wait_for_selector('.bookmark button[aria-pressed="true"]')
    check("saving flips the button to Saved", "Saved" in btn.inner_text())
    anon.reload(); anon.wait_for_selector(".bookmark button")
    check("the saved state survives a reload", anon.locator(".bookmark button").get_attribute("aria-pressed") == "true")

    # ── reading history is recorded after a few seconds ──
    anon.wait_for_timeout(6500)
    anon.goto(BASE + "/reading-history")
    check("the article appears in the reading history", anon.locator(".reader-row", has_text=a1["title"]).count() == 1)
    anon.goto(BASE + "/bookmarks")
    check("the article appears in saved articles with its save date", anon.locator(".reader-row", has_text=a1["title"]).count() == 1 and "Saved" in anon.locator(".reader-row").first.inner_text())
    anon.get_by_role("button", name=f"Remove {a1['title']} from saved articles").click()
    anon.wait_for_selector("text=Nothing saved yet")
    check("removing a bookmark empties the list with a friendly empty state", anon.get_by_role("link", name="Browse the latest news").count() == 1)

    # ── clear history (with confirmation) ──
    anon.goto(BASE + "/reading-history")
    anon.get_by_role("button", name="Clear history").click()
    check("clearing history asks for confirmation first", anon.get_by_text("Clear your whole reading history?").count() == 1 and anon.locator(".reader-row").count() == 1)
    anon.get_by_role("button", name="Yes, continue").click(); anon.wait_for_selector("text=No reading history")
    check("history is empty after clearing", anon.get_by_text("No reading history").count() == 1 and anon.locator(".reader-row").count() == 0)

    # ── preferences ──
    anon.goto(BASE + "/preferences")
    anon.get_by_label("Technology", exact=True).check(); anon.get_by_label("Health", exact=True).check()
    check("a notification toggle is hidden for plain readers", anon.get_by_text("Newsroom notifications").count() == 0)
    anon.get_by_label("Keep a reading history").uncheck()
    anon.get_by_role("button", name="Save preferences").click(); anon.wait_for_selector("text=Preferences saved.")
    anon.reload(); anon.wait_for_selector("legend")
    check("interests and the history setting persist", anon.get_by_label("Technology", exact=True).is_checked() and anon.get_by_label("Health", exact=True).is_checked() and not anon.get_by_label("Keep a reading history").is_checked())
    anon.goto(BASE + f"/news/{a2['slug']}"); anon.wait_for_timeout(6500); anon.goto(BASE + "/reading-history")
    check("with history turned off, reading is not recorded", anon.get_by_text("No reading history").count() == 1 and anon.get_by_text("Recording is").count() == 1)
    anon.goto(BASE + "/preferences"); anon.get_by_label("Keep a reading history").check(); anon.get_by_role("button", name="Save preferences").click(); anon.wait_for_selector("text=Preferences saved.")
    anon.goto(BASE + "/notifications")
    check("a reader with no notifications sees an empty state", anon.get_by_text("No notifications yet").count() == 1)
    anon_ctx.close()

    # ── notifications for someone who has some ──
    actx, au = login_ctx(b, "author@example.test")
    au.on("pageerror", lambda e: errors.append(str(e)))
    check("the header counts unread notifications", bell(au) == "Notifications, 3 unread", bell(au))
    au.goto(BASE + "/notifications")
    check("all three are listed, marked unread", au.locator(".reader-row--unread").count() == 3)
    au.get_by_role("button", name=re.compile("Mark “.*” as read")).first.click()
    au.wait_for_selector(".reader-row--unread:nth-of-type(2)"); au.wait_for_function("document.querySelectorAll('.reader-row--unread').length === 2")
    check("marking one as read leaves two unread", bell(au) == "Notifications, 2 unread", bell(au))
    au.goto(BASE + "/notifications?unreadOnly=true")
    au.get_by_role("button", name="Mark all 2 as read").click(); au.wait_for_selector("text=You’re all caught up")
    check("mark-all-read clears the unread list", bell(au) == "Notifications")
    au.goto(BASE + "/preferences")
    check("staff see the newsroom-notification toggle", au.get_by_text("Newsroom notifications").count() == 1)
    actx.close()

    # ── profile, password, sessions, data export, deletion (a throwaway account) ──
    email = f"journey{int(time.time())}@example.test"
    c1 = b.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900}); p1 = c1.new_page()
    p1.goto(BASE + "/register"); p1.get_by_label("Full name").fill("Journey Person"); p1.get_by_label("Email").fill(email); p1.get_by_label("Password").fill("a long passphrase for testing")
    p1.get_by_role("button", name="Create account").click(); p1.wait_for_url(BASE + "/"); p1.wait_for_selector('button[aria-haspopup="menu"]')
    c2 = b.new_context(); p2 = c2.new_page(); p2.goto(BASE + "/login"); sign_in(p2, email, "a long passphrase for testing", BASE + "/")  # second device

    p1.goto(BASE + f"/news/{a1['slug']}"); p1.locator(".bookmark button").click(); p1.wait_for_selector('.bookmark button[aria-pressed="true"]')
    p1.goto(BASE + "/profile")
    check("profile shows the account details", p1.get_by_text(email).count() == 1 and p1.get_by_label("Full name").input_value() == "Journey Person")
    check("the timezone list offers Asia/Kolkata (not the legacy name)", p1.locator('select[name="timezone"] option[value="Asia/Kolkata"]').count() == 1 and p1.locator('select[name="timezone"] option[value="Asia/Calcutta"]').count() == 0)
    p1.get_by_label("Full name").fill("Journey Renamed"); p1.locator('select[name="timezone"]').select_option("Asia/Kolkata")
    p1.get_by_role("button", name="Save profile").click(); p1.wait_for_selector("text=Profile saved.")
    p1.reload(); check("profile changes persist", p1.get_by_label("Full name").input_value() == "Journey Renamed" and p1.locator('select[name="timezone"]').input_value() == "Asia/Kolkata")

    p1.get_by_label("Current password").fill("not my password"); p1.get_by_label("New password").fill("another long passphrase!")
    p1.get_by_role("button", name="Change password").click(); p1.wait_for_selector("text=Current password is incorrect")
    check("a wrong current password is reported on that field", p1.locator(".auth__field-error", has_text="Current password is incorrect").count() == 1)
    p1.get_by_label("Current password").fill("a long passphrase for testing")
    p1.get_by_role("button", name="Change password").click(); p1.wait_for_selector("text=Password changed.")
    check("changing the password confirms and clears the fields", p1.get_by_label("Current password").input_value() == "")
    p2.goto(BASE + "/"); p2.wait_for_timeout(500)
    p2.goto(BASE + "/profile")
    try: p2.wait_for_url(re.compile(r"/login"), timeout=6000); out = True
    except Exception: out = False
    check("the other device was signed out by the password change", out)
    p1.reload(); check("this device stays signed in", p1.get_by_label("Full name").count() == 1)

    with p1.expect_download() as dl:
        p1.get_by_role("link", name="Download my data (JSON)").click()
    d = dl.value
    data = json.load(open(d.path()))
    check("data export downloads as a JSON file with the person's data", re.match(r"my-data-\d{4}-\d{2}-\d{2}\.json", d.suggested_filename) and data["profile"]["email"] == email and len(data["bookmarks"]) == 1)
    check("the export holds no passwords or tokens", not re.search(r"passwordHash|argon2|refreshTokenHash", json.dumps(data)))

    p1.get_by_label("Your password").fill("wrong password!"); p1.get_by_label("Type DELETE to confirm").fill("DELETE")
    p1.get_by_role("button", name="Permanently delete my account").click(); p1.wait_for_selector("text=Password is incorrect")
    check("deleting with a wrong password is refused and nothing is lost", p1.locator(".auth__field-error", has_text="Password is incorrect").count() == 1)
    p1.get_by_label("Your password").fill("another long passphrase!"); p1.get_by_label("Type DELETE to confirm").fill("nope")
    p1.get_by_role("button", name="Permanently delete my account").click(); p1.wait_for_selector("text=Type DELETE to confirm", state="visible")
    p1.get_by_label("Type DELETE to confirm").fill("DELETE")
    p1.get_by_role("button", name="Permanently delete my account").click(); p1.wait_for_url(BASE + "/")
    p1.wait_for_selector('header >> text=Log in')
    check("after deletion the visitor is signed out on the homepage", p1.locator('button[aria-haspopup="menu"]').count() == 0)
    p1.goto(BASE + "/login"); p1.get_by_label("Email").fill(email); p1.get_by_label("Password").fill("another long passphrase!"); p1.get_by_role("button", name="Log in").last.click()
    p1.wait_for_selector(".auth__error")
    check("the deleted account can no longer sign in", "Invalid email or password" in p1.locator(".auth__error").inner_text())
    c1.close(); c2.close()

    # ── responsive ──
    mctx, m = login_ctx(b, "editor@example.test", PW, {"width": 390, "height": 800})
    for path in ("/bookmarks", "/reading-history", "/preferences", "/notifications", "/profile", path1):
        m.goto(BASE + path); m.wait_for_load_state("networkidle")
        ov = m.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(f"no horizontal overflow at 390px: {path.split('/')[1]}", ov <= 0, f"{ov}px")
    m.goto(BASE + "/preferences"); m.screenshot(path="/tmp/stage7-preferences-mobile.png")
    m.goto(BASE + "/profile"); m.screenshot(path="/tmp/stage7-profile-mobile.png")
    dctx, d1 = login_ctx(b, "reader@example.test")
    d1.goto(BASE + path1); d1.wait_for_selector(".bookmark button"); d1.screenshot(path="/tmp/stage7-article-desktop.png")
    d1.goto(BASE + "/profile"); d1.screenshot(path="/tmp/stage7-profile-desktop.png", full_page=True)
    check("no uncaught JS errors", not errors, "; ".join(errors[:2]))
    b.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} reader browser checks passed")
sys.exit(1 if failed else 0)
