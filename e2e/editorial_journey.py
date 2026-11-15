"""
Real-browser acceptance journey for the editorial screens (Playwright for Python, Chromium).
Prerequisites: app running on BASE (default http://localhost:3000) against a database seeded with the dev users
(author@/editor@/admin@/reader@example.test, password in SEED_DEV_PASSWORD) and no articles.
Run: SEED_DEV_PASSWORD=... python3 e2e/editorial_journey.py
"""
import datetime, os, re, sys, time
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:3000")
PW = os.environ["SEED_DEV_PASSWORD"]
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""), flush=True)

def login(browser, who, viewport=None):
    ctx = browser.new_context(viewport=viewport or {"width": 1280, "height": 900})
    pg = ctx.new_page()
    pg.goto(f"{BASE}/login"); pg.get_by_label("Email").fill(f"{who}@example.test"); pg.get_by_label("Password").fill(PW)
    pg.get_by_role("button", name="Log in").last.click()
    pg.wait_for_url(f"{BASE}/"); pg.wait_for_selector('button[aria-haspopup="menu"]')
    return ctx, pg

def bell(pg):
    pg.goto(BASE + "/")
    return pg.locator('button[aria-label^="Notifications"]').first.get_attribute("aria-label")

with sync_playwright() as p:
    b = p.chromium.launch()
    errors = []

    # ── access control ──
    anon = b.new_context().new_page()
    anon.goto(BASE + "/author/dashboard")
    try:
        anon.wait_for_url(re.compile(r"/login\?next=%2Fauthor%2Fdashboard"), timeout=8000); redirected = True
    except Exception:
        redirected = False
    check("anonymous visitor is sent to log in and brought back", redirected, anon.url)
    check("no editor content was rendered to the anonymous visitor", anon.locator(".rte, .stat-grid").count() == 0)
    rctx, reader = login(b, "reader")
    reader.goto(BASE + "/author/dashboard")
    check("a reader sees an explicit 'no access' state", reader.get_by_role("heading", name="You don’t have access to this page").count() == 1)
    rctx.close()

    actx, author = login(b, "author")
    author.on("pageerror", lambda e: errors.append(str(e)))
    author.goto(BASE + "/admin/articles")
    check("an author cannot open the editorial queue", author.get_by_role("heading", name="You don’t have access to this page").count() == 1)
    author.goto(BASE + "/author/dashboard")
    check("dashboard empty state for a new author", author.get_by_text("No articles yet").count() >= 1 and author.locator(".stat__n").first.inner_text() == "0")

    # ── create a draft in the rich-text editor ──
    author.get_by_role("link", name="New article").first.click()
    author.wait_for_selector(".rte__content")
    author.get_by_role("button", name="Save draft").click()
    check("empty draft shows field errors (headline, summary, body)", author.locator(".auth__field-error").count() == 3)
    author.get_by_label("Headline", exact=True).fill("Council approves new transit budget")
    author.get_by_label("Summary", exact=True).fill("The council voted 7-2 to fund three new bus lines.")
    author.get_by_label("Tags").fill("transport, city")
    author.locator(".rte__content").click()
    author.get_by_role("button", name="Subheading").click()
    author.keyboard.type("What changed"); author.keyboard.press("Enter")  # Enter after a heading starts a normal paragraph
    author.get_by_role("button", name="Bold").click(); author.keyboard.type("Three routes"); author.get_by_role("button", name="Bold").click()
    author.keyboard.type(" will start next spring, officials said.")
    author.get_by_role("button", name="Save draft").click()
    author.wait_for_url(re.compile(r"/author/articles/[0-9a-f-]{36}/edit"))
    art_id = re.search(r"articles/([0-9a-f-]{36})/edit", author.url).group(1)
    author.wait_for_selector("text=Draft saved.")
    api = author.request.get(f"{BASE}/api/v1/articles/{art_id}").json()["data"]
    check("draft saved as DRAFT v1 with formatting preserved (typing right after a toolbar click loses nothing) and tags", api["status"] == "DRAFT" and api["version"] == 1 and "<h3>What changed</h3>" in api["bodyHtml"] and "<strong>Three routes</strong> will start next spring" in api["bodyHtml"] and not api["bodyHtml"].endswith("<p></p>") and sorted(t["slug"] for t in api["tags"]) == ["city", "transport"], api["bodyHtml"])

    # link toolbar validation
    author.locator(".rte__content").click(); author.keyboard.press("Control+End")
    author.keyboard.press("Shift+Home"); author.get_by_role("button", name="Add link").click()
    author.get_by_label("Link address").fill("javascript:alert(1)"); author.get_by_role("button", name="Apply").click()
    check("javascript: links are refused in the editor", author.get_by_text("Enter a full link starting with https://").count() == 1)
    author.get_by_role("button", name="Cancel").click()

    # edit + save bumps version; submit
    author.locator(".rte__content").click(); author.keyboard.press("Control+End"); author.keyboard.type(" Funding starts in April.")
    author.get_by_role("button", name="Save changes").click(); author.wait_for_selector("text=Version 2")
    check("saving again moves to version 2", author.get_by_text("Version 2").count() >= 1)
    author.get_by_role("button", name="Submit for review").click()
    author.wait_for_url(re.compile(r"/author/articles\?submitted=1")); author.wait_for_selector("tbody tr")
    check("submitting confirms and lists the article as Submitted", author.get_by_text("Submitted for review").count() >= 1 and "submitted" in author.locator("tbody tr").first.inner_text().lower())

    # ── editor reviews ──
    ectx, editor = login(b, "editor")
    check("editor sees one unread notification", bell(editor) == "Notifications, 1 unread", bell(editor))
    editor.locator('button[aria-haspopup="menu"]').first.click()
    editor.get_by_role("menuitem", name="Review queue").click()
    editor.wait_for_url(re.compile(r"scope=review")); editor.locator("tbody tr").or_(editor.get_by_text("queue is empty")).first.wait_for()
    check("review queue lists the submitted article", editor.get_by_role("link", name="Council approves new transit budget").count() == 1)
    editor.get_by_role("link", name="Council approves new transit budget").click()
    editor.wait_for_selector("text=Workflow")
    check("editor sees review actions only (no approve before review starts)", editor.get_by_role("button", name="Start review").count() == 1 and editor.get_by_role("button", name="Approve").count() == 0)
    editor.get_by_role("button", name="Start review").click()
    editor.wait_for_selector('button:has-text("Request changes")')
    editor.get_by_role("button", name="Request changes").click()
    editor.get_by_label("Reason (shared with the author)").fill("too short")
    editor.get_by_role("button", name="Confirm: Request changes").click()
    check("a too-short reason is refused", editor.get_by_text("at least 10 characters").count() >= 1)
    editor.get_by_label("Reason (shared with the author)").fill("Please name the councillors who voted against.")
    editor.get_by_role("button", name="Confirm: Request changes").click()
    editor.wait_for_selector('.badge:has-text("Changes requested")')
    check("status moves to Changes requested and the decision is in the history", editor.get_by_text("Please name the councillors").count() >= 1)

    # ── author sees feedback and revises ──
    check("author is notified", "unread" in bell(author) and not bell(author).endswith("0 unread"), bell(author))
    author.goto(BASE + "/author/dashboard")
    check("dashboard shows the requested changes with the reviewer's reason", author.get_by_text("Please name the councillors").count() >= 1)
    author.get_by_role("link", name="Council approves new transit budget").first.click()
    author.wait_for_selector(".rte__content"); author.wait_for_selector("text=Changes requested by")
    banner = author.get_by_role("heading", name="Changes requested by Dev Editor").count(); unlocked = author.get_by_label("Headline", exact=True).is_enabled()
    check("feedback banner is shown on the editor page and editing is unlocked", banner == 1 and unlocked, f"banner={banner} unlocked={unlocked} h2s={author.locator('h2').all_inner_texts()}")
    check("a freshly opened article is not marked as having unsaved changes", author.get_by_text("You have unsaved changes").count() == 0 and author.get_by_role("button", name="Save changes").is_disabled())
    author.locator(".rte__content").click(); author.keyboard.press("Control+End"); author.keyboard.type(" Councillors Rao and Smith voted against.")
    author.get_by_role("button", name="Save changes").click(); author.wait_for_selector("text=Version 3")
    author.get_by_role("button", name="Submit for review").click(); author.wait_for_url(re.compile(r"submitted=1"))

    # ── editor approves, schedules (timezone), cancels, publishes ──
    editor.goto(f"{BASE}/author/articles/{art_id}/edit")
    editor.get_by_role("button", name="Start review").click(); editor.wait_for_selector('button:has-text("Approve")')
    editor.get_by_role("button", name="Approve").click()
    editor.get_by_label("Note (optional)").fill("Sources check out.")
    editor.get_by_role("button", name="Confirm: Approve").click()
    editor.wait_for_selector('.badge:has-text("Approved")')
    public = b.new_context().new_page()
    slug = api["slug"]
    check("approved article is still not public", public.goto(f"{BASE}/news/{slug}").status == 404)
    editor.get_by_role("button", name="Schedule…").click()
    tomorrow = (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(days=1)).strftime("%Y-%m-%dT09:30")
    editor.get_by_label("Publish at (local time)").fill(tomorrow)
    editor.get_by_label("Timezone").select_option("Asia/Kolkata")
    expected = (datetime.datetime.strptime(tomorrow, "%Y-%m-%dT%H:%M") - datetime.timedelta(hours=5, minutes=30))
    preview = editor.locator('[role="status"]:has-text("Publishes at")').inner_text()
    check("schedule picker previews the exact UTC instant for the chosen timezone", expected.strftime("%H:%M:%S") in preview and "UTC" in preview, preview)
    editor.get_by_role("button", name="Confirm: Schedule").click()
    editor.wait_for_selector('.badge:has-text("Scheduled")')
    check("scheduled state shows the time and a cancel option", editor.get_by_text("Scheduled for").count() == 1 and editor.get_by_role("button", name="Cancel schedule").count() == 1)
    editor.get_by_role("button", name="Cancel schedule").click(); editor.wait_for_selector('.badge:has-text("Approved")')
    editor.get_by_role("button", name="Publish now").click(); editor.wait_for_selector('.badge:has-text("Published")')
    r = public.goto(f"{BASE}/news/{slug}")
    check("published article is public with its formatting", r.status == 200 and public.locator("h1").first.inner_text() == "Council approves new transit budget" and public.locator("strong:has-text('Three routes')").count() >= 1)
    check("author is told it was published, with a link to the story", "unread" in bell(author))
    author.locator('button[aria-label^="Notifications"]').first.click()
    check("notification links to the live article", author.locator(f'a[href="/news/{slug}"]').count() >= 1)

    # ── revision history with diff ──
    editor.goto(f"{BASE}/author/articles/{art_id}/edit")
    editor.get_by_role("button", name="Compare with current").first.click()
    check("revision diff highlights what the author added", editor.locator("ins.diff__add").count() >= 1)

    # ── optimistic concurrency in the UI: two tabs, same editor ──
    tab_a = editor
    tab_b = ectx.new_page(); tab_b.goto(f"{BASE}/author/articles/{art_id}/edit"); tab_b.wait_for_selector(".rte__content")
    tab_b.get_by_label("Subheadline").fill("Edited in the other tab"); tab_b.get_by_role("button", name="Save changes").click(); tab_b.wait_for_selector("p.editor__saved:has-text(\"Saved.\")")
    tab_a.get_by_label("Summary", exact=True).fill("A conflicting summary written in the first tab."); tab_a.get_by_role("button", name="Save changes").click()
    tab_a.wait_for_selector("text=Version conflict")
    check("a stale save is refused with a clear conflict message (nothing overwritten)", tab_a.get_by_role("button", name="Reload latest").count() == 1 and "conflicting summary" not in (editor.request.get(f"{BASE}/api/v1/articles/{art_id}").json()["data"]["summary"]))

    # ── responsive ──
    mctx, m = login(b, "editor", {"width": 390, "height": 800})
    for path in ("/author/dashboard", f"/author/articles/{art_id}/edit", "/admin/articles", "/author/articles/new"):
        m.goto(BASE + path); m.wait_for_load_state("networkidle")
        ov = m.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(f"no horizontal overflow at 390px: {path.split('/')[-1] or path}", ov <= 0, f"{ov}px")
    m.goto(f"{BASE}/author/articles/{art_id}/edit"); m.screenshot(path="/tmp/stage6-editor-mobile.png", full_page=False)
    ectx.close()
    ectx2, e2 = login(b, "editor")
    e2.goto(f"{BASE}/author/articles/{art_id}/edit"); e2.wait_for_selector(".rte__content"); e2.screenshot(path="/tmp/stage6-editor-desktop.png")
    actx.close() if False else None
    author.goto(BASE + "/author/dashboard"); author.screenshot(path="/tmp/stage6-dashboard.png")
    check("no uncaught JS errors in the author session", not errors, "; ".join(errors[:2]))
    b.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} editorial browser checks passed")
sys.exit(1 if failed else 0)
