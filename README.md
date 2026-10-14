# Venture Tasks

A to-do list for someone running several small businesses or projects at once — organized into Pages (tabs) and sections per venture, with a cross-venture Today view, drag-and-drop, color coding, due dates, recurring tasks, a "someday" bucket, per-venture health stats (including open client value), client/value tagging for freelance work, calendar export (one-time file or a live subscribe link), shared lists you can co-edit with another account in real time, a Family Calendar page type with freestanding events and any-time list linking, a grocery-list page type with ready-made categories, undo, a font/color-customizable appearance, voice commands, a mobile-friendly layout, and an optional AI co-pilot you connect yourself.

It's a static site: plain HTML, CSS, and JavaScript (ES modules), no build step, no database of its own to run. Everything you enter is stored in your browser's `localStorage`, unless you sign in for cross-device sync.

**How this is actually set up and sold:** there's one live copy of this app, hosted once (GitHub Pages) and connected to one Supabase project — the same model as [Shiny Ledger](https://d3-interactiveandapps.github.io/ShinyLedger/). Anyone who gets the link just opens it and starts using it: no Supabase account, no API keys, no setup of any kind on their end, whether or not they ever create an account for sync. Everything from "Hosting it — GitHub Pages" through "Setting up accounts and cross-device sync" below is the one-time operator runbook for *that single instance* — it's reference material for you, not something a buyer or end user ever needs to read, let alone do themselves.

## Design

The app's visual design went through a full pass — a left-hand sidebar for navigation (collapsing to a horizontal top bar on narrower screens), a proper spacing/type/radius/shadow system behind every component, restyled cards, buttons, badges, and modals, and a rebuilt Family Calendar — especially its mobile view, which used to cram full event chips into ~84px squares and now shows a clean, legible month grid with simple color dots per event (tap any day to open a full-size, fully-editable popup with every event's real text and controls). The built-in theme picker works exactly as before — same 35+ presets, same custom color overrides — it just now lives in a visually cleaner Settings modal. No data, storage format, or account/sync behavior changed in this pass; it's appearance-only.

## Features

- **Pages**, switched via the sidebar on the left (a horizontal scrollable bar at the top on narrower screens) — e.g. keep "Professional Tasks" and "Daily Life" completely separate, each with its own sections and its own heading (click the big title at the top to rename the active page). Add as many as you like with the **+** button; delete the current one with the **Delete page** button next to the title (there's always at least one page left).
- **Today view** — tap the **Today** button (it shows a count badge when there's anything to see) for everything overdue or due today, pulled from *every* page at once, not just whichever one you're currently looking at. Check something off right there, or tap its page/section tag to jump straight to it. See "Using the Today view" below.
- Three page types, chosen when you add a page: a regular **to-do list**, a **grocery list** — a stripped-down item type (name, category, checkbox, color only — no due dates, recurrence, someday, or AI). A new grocery page starts pre-seeded with 13 common categories (Produce, Dairy & Eggs, Meat & Seafood, Bakery, Frozen, Pantry, Canned Goods, Breakfast & Cereal, Snacks, Beverages, Condiments & Spices, Household, Personal Care) so there's something to add items to right away — rename, delete, reorder, or add your own alongside them like any other category, and a category picker right on each item lets you reassign it anytime — or a **Family Calendar**, a month-grid view for freestanding events (not tied to any to-do list) that can also pull in due dates from any other page you link to it. See "Family Calendar" below.
- **Grocery auto-categorization** — add an item to a grocery list via the search box or by voice without naming a category, and it's filed into the right one automatically (milk → Dairy & Eggs, bananas → Produce, etc.) using a built-in keyword list, with your connected AI provider as a fallback for anything that list doesn't recognize. The category picker on each item still overrides any guess. See "Grocery items file themselves into a category" below.
- Sections (or, on a grocery page, categories) freely added, renamed, color-coded, collapsed, and reordered — by drag-and-drop on desktop, or with a pair of up/down buttons on touch devices (drag-and-drop isn't something touchscreens support natively).
- Tasks within a section: add, check off, color-code, drag between sections, and **reorder within the same section** — by drag-and-drop on desktop, or the same up/down buttons on touch.
- Checking off a task on a to-do page gets a small "nice work" animation (not shown on grocery lists, where checking items off is just... checking items off).
- **Voice commands** — tap the Voice button and just say what you want: "add milk to produce," "check off bananas," "uncheck the report." See "Using voice commands" below for details, examples, and browser support.
- **Search, with a smart Enter** — type to filter a to-do or grocery list down to matching items; press Enter and it checks off a match, unchecks an already-checked one, or adds it as new if nothing matched. See "Searching a list" below.
- **Hide done** — a toggle next to search that hides everything already checked off on a to-do or grocery page, live (checking something off while it's on hides it immediately), remembered per page. See "Hiding what's checked off" below.
- **Collapse all / Expand all** — a toolbar button next to Hide done that collapses (or expands) every section on the current page in one click, instead of clicking each section's own arrow one at a time. The per-section collapse arrows themselves are also bigger now, especially on mobile, so they're an easy tap. See "Collapsing sections" below.
- **Undo** — Ctrl+Z (Cmd+Z on Mac) undoes your last change: adding/deleting/checking a task, renaming a section, reordering, etc. It stays out of the way while you're typing in a text field, so normal text-undo still works there.
- **Mobile-friendly** — usable on a phone or tablet, not just a desktop browser: touch-sized tap targets throughout, no unwanted zoom-in when you tap a text field (a common iOS Safari quirk), and the touch reordering buttons mentioned above in place of drag-and-drop.
- **Add it to your home screen** — the app installs like a real app (own icon, own window, works with no signal), using the same icon shown in the browser tab. See "Add it to your home screen" below.
- **Appearance**, in Settings (the button at the bottom of the sidebar): pick from 35+ built-in themes, grouped into Classic, the four seasons, Events (birthdays, weddings), and Hobbies & Interests (gaming, sports), for an instant, cohesive look — or pick a font and override the text, accent, window, and background colors individually, similar in spirit to the color coding already available per section. Every field stays editable no matter how you got there. "Reset colors" goes back to following the system's own light/dark setting. See "Themes" below.
- Due dates with urgency badges; recurring tasks — daily, weekly, monthly, every weekday, weekends only, or specific custom days (e.g. "every Monday and Thursday") — where completing one automatically creates the next occurrence; a separate **Daily task** option for something that resets itself each day in place rather than spawning a new row (a daily-posting habit, say); and a "someday" bucket for tasks with no timeline (to-do pages only). See "Daily tasks and flexible recurrence" below.
- **Client and value tags**, in a task's details panel (to-do pages only) — put a client name and a dollar amount on a task (an invoice, a deliverable, anything billable) and both show up as small badges right on the row.
- A small health strip per section (open tasks, overdue count, days since last activity, and now total open client value when any tagged tasks are still unchecked) on to-do pages.
- **Calendar export** — in Settings → Your data, export a one-time `.ics` file of every open task's due date, importable into Apple Calendar, Google Calendar, or Outlook. See "Exporting to a calendar app" below for how it works and its one real limitation.
- **Live calendar** — also in Settings → Your data, a subscribe link (needs an account) that stays current on its own, no re-exporting. See "Live calendar: a subscribe link instead of a file" below.
- **Shared lists** — turn any page into a shared list (the **Share list** button next to the page title) and invite someone else by code; both of you see each other's changes within a second or two, same as two of your own devices syncing. See "Sharing a list with someone else" below.
- **Family Calendar** — a month-grid page type for a family (or any group) to see the same calendar and each other's changes to it, with freestanding events (a date, and an optional time) that don't need to live on a to-do list at all, plus the ability to link any existing list to any calendar at any time so its due dates show up on the grid too. Events can repeat too (same daily/weekly/monthly/weekday/weekend/custom options as a to-do task's recurrence), and every day with at least one event on it — even just one — has a small view button so you can always see exactly what's on any given day, not only the busy ones. Major US holidays show up automatically, every year, with no upkeep needed. See "Family Calendar" below.
- An optional AI co-pilot, off by default. Connect your own Claude, ChatGPT, or Gemini API key in Settings to get: a task breakdown into subtasks, a first-draft reply/outline for a task, "what's blocking this" suggestions, and a weekly review that summarizes the active page's sections.
- Optional accounts with real cross-device sync — sign up right in the app, sign in on another computer, and see the same pages/sections/tasks. No setup needed to use it; it's already connected. Works fully without an account too, storing data on-device only.
- Export/Import as JSON, for backing up or moving to another browser or computer by hand. Export/import now carries every page, not just one.

## Running it locally

The app is loaded as ES modules (`<script type="module">`), which is what lets it stay a clean set of separate, readable files instead of one giant one — but it also means browsers won't run it from a plain double-clicked `file://` link; they require it to be served over `http://`. The fix is a one-line local server, from inside this folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

then open the URL it prints (e.g. `http://localhost:3000` or `http://localhost:8000`). Leave that terminal window open while you use the app; closing it stops the server.

This is a real, if small, inconvenience compared to true double-click — it was tried as a pre-bundled single file so double-click would work directly, but that path turned out to be unreliable across browsers (font loading and storage behave differently for `file://` pages depending on the browser, and it's easy to end up opening the file from inside an unextracted zip, which silently breaks the relative links to the CSS/JS). The one-line server avoids all of that and behaves identically everywhere, so it's what this app uses.

## Hosting it — GitHub Pages (the one live instance)

This is the one-time deploy. Do it once; every update after this is just a new commit/push to the same repo.

1. Create a new GitHub repository and upload every file from this folder into it — they're all meant to sit directly in the repo root, with no subfolders (see "Project structure" below for why).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch", pick your main branch and the `/ (root)` folder, then save.
4. GitHub will give you a URL like `https://<your-username>.github.io/<repo-name>/`. That's the live app — this is the link everyone uses, in Gumroad, in itch.io, everywhere.

No backend, no environment variables, no build step required.

## Selling it (Gumroad, itch.io) — one link, not a file

This isn't sold as a download anyone unzips and hosts themselves — it's the same model as Shiny Ledger: one live link, and every listing just points at it.

- **Gumroad:** list it as a $0 (or "pay what you want") digital product. The "Content" page people see after checkout is just the live link, plus the usual "Add to Home Screen" instructions (see "Add it to your home screen" above) and sync instructions (sign in, same account, on the other device). Gumroad asks for an email at checkout even on a free item — everyone who grabs it becomes someone you can email about future updates.
- **itch.io:** make an HTML project, upload a tiny one-button "launcher" page (title screen → opens the real app URL in a new tab — this is what gets you a Run button and a spot in itch's "Play in browser" listings, since itch wants an uploaded file, not a bare external link), and put the live link front and center in the description too.
- Cross-link them: the app's footer links out to itch.io, Gumroad, and GitHub (see "Features" above), and each storefront page links back to the live app.

There's no license-key enforcement and no paywall built into the app itself — it's free to use once someone has the link, same as Shiny Ledger. If a future version wants to actually gate something behind a purchase, that needs real backend support (a licensing service or similar) — a pure static site can't verify a purchase on its own.

## How the AI co-pilot actually works (security model)

This app never talks to a server you or Claude control — there isn't one. When you connect a provider in Settings:

- Your API key is stored only in `localStorage`, in your own browser, on your own device.
- When you click an AI action (breakdown, draft, blocked-on, weekly review), your browser sends a request **directly** from the page to that provider's own API (Anthropic, OpenAI, or Google), using your key, over HTTPS.
- Nothing passes through any intermediary server. No one — not even you as the "developer" of this copy — has a way to see that traffic from outside your own browser.
- The trade-off: because the key lives in `localStorage`, it's only as safe as the device and browser it's stored in, and it's visible to anyone with access to that browser's dev tools on that device. Treat it like any other password stored in a browser — don't connect a shared/public computer, and revoke the key from the provider's dashboard if a device is ever lost or compromised.
- AI is **off by default**. The task list, sections, due dates, recurrence, and everything else work fully with no AI connection at all.

Supported providers and where to get a key:
- **Claude (Anthropic)** — console.anthropic.com
- **ChatGPT (OpenAI)** — platform.openai.com
- **Gemini (Google)** — aistudio.google.com

Model names drift over time, so the Settings panel lets you type the exact model ID you want rather than hardcoding one that might go stale (a current example is pre-filled as a placeholder).

## Using the Today view

The **Today** button (top toolbar) opens a panel showing everything overdue or due today, grouped that way, pulled from every to-do page at once — not just the one you happen to be looking at. It's built for exactly the situation this app exists for: running several ventures means the thing that's actually urgent today could be sitting on any one of them, and flipping through tabs one at a time to find out defeats the point.

Each row shows the task, its due-status badge, its client/value tags if it has any, and a small pill with the page and section it belongs to — tap that pill to jump straight there (the panel closes automatically). Checking the box right there marks it done, same as checking it off anywhere else, and it disappears from the list immediately. The button itself carries a small count badge whenever there's anything overdue or due today, so you can tell at a glance without even opening it.

A couple of deliberate scope choices: it only looks at to-do pages (grocery items don't have due dates, so there's nothing for it to show there), and it only surfaces *overdue* and *due today* — not "due this week" — on the theory that a Today view that also shows next Tuesday stops being about today. Someday tasks are left out too, same reasoning.

## Using voice commands

Tap the **🎤 Voice** button (top toolbar, next to the item count), say your command, and the app acts on it immediately — no need to hold the button down or say a wake word, it listens for one phrase and stops.

What it understands, on whichever page is currently open:

- **Adding an item** — "add milk to produce", "put bananas in produce", or just "add milk" if the page only has one section (if there's more than one, it'll ask which one you meant rather than guess).
- **Checking something off** — "check off bananas", "check bananas", "complete invoice for client A", "mark bananas as done".
- **Unchecking something** — "uncheck bananas", "unmark bananas", "mark bananas as not done".

It doesn't need an exact match — "check off the proof" will find a task called "Send proof to client," and filler words like "the," "a," and "please" are ignored. If it can't find a matching item, doesn't understand the phrase, or isn't sure which section you meant, it says so in the status line rather than guessing and doing the wrong thing.

This runs entirely in your browser, using the same built-in speech recognition Chrome/Edge/Safari already have for dictation — nothing is sent to any server of ours, no API key or account needed. **Firefox doesn't implement this browser feature**, so the Voice button there will explain that and nothing else; everything else in the app is unaffected. The first time you use it, your browser will ask for microphone permission, same as any site that uses voice input.

## Searching a list

Every to-do and grocery page has a search box right above the item count. It does two things, and which one happens depends only on whether what you typed already exists:

- **As you type**, the list filters down to items whose name contains what you've typed — sections with nothing matching just drop out of view until you clear the box. Handy on its own for jumping straight to one item on a long list.
- **Press Enter**, and it looks at what's actually on the list:
  - If nothing matches, it adds what you typed as a brand-new item. On a to-do page that lands in the first section (easy to drag or move afterward); on a grocery page it's auto-categorized into whichever category it actually belongs in — see "Grocery items file themselves into a category" below.
  - If something matches and it's **not** checked off, Enter checks it off.
  - If something matches and it **is** already checked off, Enter unchecks it.

That's the exact "my partner says add milk, but milk's already on the list and checked off" case: type "milk," hit Enter, done — no scrolling to find it, no deciding whether you're adding or re-checking something, the app works that out from whether it's already there. The match doesn't need to be exact either (same fuzzy matching voice commands use) — "mil" finds "2% Milk." The search box clears itself after Enter, ready for the next item; Escape or the **×** button clears it without doing anything. It's hidden on Family Calendar pages, since those don't have checkable list items in the same sense.

## Hiding what's checked off

The **☑️ Hide done** button, next to the search box, hides every checked-off item on a to-do or grocery page so you can focus on what's actually left — same idea as collapsing finished layers, just for your list. Checking something off while it's on makes that item disappear right then, not just on the next visit. A section that ends up with nothing left to show says so ("Nothing left — 3 checked-off items hidden") instead of claiming the section is empty. The on/off state is remembered per page (so your grocery list can stay in "hide done" mode while a project list doesn't), and it works together with search — searching while "Hide done" is on only shows open items that match, so a checked-off match stays hidden rather than popping back into view. It's hidden on Family Calendar pages, same as search.

## Grocery items file themselves into a category

Add an item to a grocery list through the search box's "Enter to add" (above) or by voice without naming a category ("add milk" rather than "add milk to dairy"), and it lands in the right category on its own — "milk" goes under Dairy & Eggs, "bananas" under Produce, "paper towels" under Household, and so on — instead of you having to pick one by hand every time.

This runs off a built-in list of common grocery keywords, instantly, with no network call and nothing to configure — it covers the kind of items that come up on a typical list. It only ever guesses among the categories that actually exist on *your* page right now, so a category you've renamed or made up from scratch is never bypassed; something it doesn't recognize still gets added, just without a confident guess (same first-category fallback as before this feature existed). If you've connected an AI provider in Settings, anything the built-in list draws a blank on gets one more try — a quick question to that provider asking which of your actual categories it belongs in — before falling back.

None of this takes away the option to place things yourself: typing directly into a specific category's own "add" box still adds it exactly there, no guessing involved, and the category picker already on every grocery row (see the Features list above) still moves anything, auto-categorized or not, to wherever you actually want it — a wrong guess is always one click away from fixed.

## Daily tasks and flexible recurrence

A task's details panel (the **⋯** button, to-do pages only) has two related but distinct ways to make it repeat — pick whichever actually matches what you mean:

- **Repeat** covers a task that should spawn a fresh new row every time you finish it — the existing kind of recurrence, now with more patterns than just daily/weekly/monthly: **every weekday** (Monday–Friday), **weekends** (Saturday & Sunday), or **custom days** — tick whichever specific weekdays you want (e.g. "every Monday and Thursday") from the small day-picker that appears once you choose Custom. Completing a repeating task checks off *that* row and creates the next occurrence, dated for whichever of its days comes next — handy for something like "pay rent" or "submit a report," where you want a history of each time it was actually done.
- **Daily task** is a different idea: one single row you check off, that just resets itself back to unchecked once the day rolls over — no new row, no history, just the same task waiting for you again tomorrow. This fits something like a daily-posting habit much better than Repeat does, since there's nothing to clean up or scroll past; it's one line that's either done for today or not. The reset happens automatically (checked at app load, and again periodically while the app stays open, so it catches up even if the browser tab was open across midnight).

The two are mutually exclusive on any one task — turning Daily on clears whatever Repeat pattern was set, and picking a real Repeat option turns Daily back off — since mixing "resets itself in place" with "spawns a new row" on the same task would just be confusing. A repeating task shows a small ↻ badge on its row (hover it to see exactly which pattern); a daily task shows a small ☀ badge instead.

Family Calendar events use the same Repeat vocabulary — see "Family Calendar" below for how that works there, since a calendar event's recurrence behaves a little differently from a to-do task's.

## Collapsing sections

Every section has its own collapse arrow, now bigger than before (especially on mobile, where it was easy to miss) so it's a comfortable tap. Next to **Hide done**, a **Collapse all** button collapses every section on the current page in one click — it flips to **Expand all** once everything's collapsed, so the same button opens them all back up too. It's smart about mixed states too: if some sections are collapsed and others aren't, it reads "Collapse all" (there's still something left to collapse) rather than claiming the page is already fully collapsed. Like the individual collapse states it's built on, this is remembered per page and survives a reload.

## Themes

Settings → Appearance has a **Theme** dropdown with 35+ built-in flat-color themes to choose from, grouped into labeled sections so a long list stays easy to scan: **Classic** (neutral, no particular season or occasion — Midnight, Slate, Terminal, and the like), the four **seasons** (Spring, Summer, Fall, Winter — each with its own handful of seasonally-toned palettes), and **Events** and **Hobbies & Interests** for anything occasion- or interest-specific (Birthday Party, Wedding Day, and Evergreen Holiday under Events; Game Night, Retro Arcade, Stadium Lights, and Home Team under Hobbies & Interests). Each theme is a complete, cohesive look: a background and panel color, a text color, an accent color, and a font, all picked to go together. Picking one applies everything at once, live, no reload needed.

One thing this round deliberately *doesn't* do: a theme is still one setting for the whole app, not something that can differ from one list or calendar to the next. Varying the theme per page would have meant reworking how appearance settings are stored and applied throughout the app for a fairly niche payoff, so it's being skipped for now — every page shares whichever theme (or custom colors) you've picked in Settings.

It's never all-or-nothing, though. Every piece a theme sets — text, accent, window ("panel"), background, and font — is still its own separate control right below the dropdown, so picking "Forest" and then deciding you'd rather have a different accent just means changing the accent swatch; nothing else about the theme is disturbed. Once you've hand-edited any single color, the dropdown shows **Custom** instead of claiming you're still on whichever preset you started from — it's just not exactly that preset's colors anymore. You can also skip presets entirely and build a look from scratch the same way this worked before themes existed: pick a font and set the four colors yourself.

The first option, **Custom / automatic (system light or dark)**, is also what "Reset colors" goes back to — it's different from the "Default" theme just below it in the list: Default is always light regardless of your system setting, while Custom/automatic is "no override at all," following whatever your OS or browser's own light/dark preference is, the same way the app behaved before any of this existed.

A theme choice (or a hand-picked set of colors) is saved like any other setting and comes back exactly as you left it next time you open the app, on that device; it isn't part of cross-device account sync, so a second device keeps its own appearance.

## Tracking client work

Open a task's details (the **⋯** button) and you'll find **Client** and **Value** fields alongside due date and recurrence. Neither is required — they're there for when a task is billable work and it's useful to see that at a glance. Set either one and it shows up as a small badge right on the row (a client name, a dollar amount, or both), in the Today view, and rolled up per section: the health strip adds up the value of every still-open tagged task in that section and shows it as "$X open" — a quick read on how much unbilled or unfinished work is sitting in one place. A recurring task carries its client/value tags forward to each new occurrence, same as its color does.

This is intentionally simple — a tag and a number, not invoicing or time tracking — but it's enough to answer "how much open client work do I actually have right now" without leaving the task list.

## Exporting to a calendar app

Settings → Your data → **Export calendar (.ics)** downloads every open to-do-page task's due date as a standard `.ics` file, with the task text as the event title and its page, section, client, and value (whatever's set) in the event description. Double-click the file, or import it, to add those due dates to Apple Calendar, Google Calendar, Outlook, or anything else that reads the iCalendar format. A Family Calendar page's own events come along too (grocery items still don't, same as ever) — one with a time set exports as a real timed event with a default one-hour duration, not an all-day one. A repeating Family Calendar event exports just its one real anchor date, not every date it projects onto in-app (see "Family Calendar" below) — true recurring events in the exported file (an actual `RRULE`) would be a nice follow-up, just not part of this round.

The one real limitation, worth being upfront about: this is a **snapshot**, not a live feed. A static site has nowhere to host the kind of always-on `webcal://` subscription URL that updates itself automatically — that needs a server watching for changes and serving requests, which is exactly the backend this app deliberately doesn't have. So it's a re-export-when-you-want-it-to-catch-up tool, not a set-it-and-forget-it sync. If you want the live version instead, that's the next section — it needs the small server endpoint this one deliberately avoids, which is exactly what it adds.

## Live calendar: a subscribe link instead of a file

Settings → Your data → **Get my calendar link** (only shown once you're signed in — see "Setting up accounts and cross-device sync" below if you haven't yet) gives you a URL instead of a file. Add that URL to Apple Calendar, Google Calendar, or Outlook as a *subscribed* calendar — each of them has an "add by URL" or "subscribe" option for exactly this — and from then on it checks itself for updates on its own schedule (typically every few hours), no re-exporting. It shows the same due dates as the one-time export above, plus anything from a shared list you're a member of (see the next section), since a shared list's due dates are part of your account's data either way.

This needed one small piece of actual server (an "Edge Function," which is really just a tiny bit of code Supabase runs for you on request) — see "Deploying the live calendar and shared lists" below for the one-time setup. Keep the link itself private: anyone who has it can see that account's due dates with no further login, the same way anyone who has your Google Calendar's "secret address" can see your events. There's no "regenerate" button in the UI yet; if a link ever leaks, you can revoke it by deleting its row from the `calendar_tokens` table in the Supabase dashboard — the old link stops working, and a fresh "Get my calendar link" click issues a new one.

Worth being clear about since it trips people up: this live link is a read-only external feed for Apple/Google/Outlook-style calendar apps — it's not the same thing as the in-app Family Calendar below, which is its own page you view and edit right inside Venture Tasks and sync live between accounts. Nothing stops you from using both — a Family Calendar page's own events show up in this feed the same as any other due date would.

## Sharing a list with someone else

Next to any page's title, **Share list** turns that page into a shared list: click **Generate invite code**, send the 6-character code to whoever you want on it (text, email, however), and once they enter it under Settings → Account & sync → **Join shared list**, that page shows up for them too — pointed at the exact same sections and tasks, not a copy. From then on, edits either of you make (checking something off, adding an item, changing a due date) show up for the other within a second or two, the same way your own two devices stay in sync today. A shared page gets a small &#128101; icon on its tab so it's easy to tell apart from a personal one.

A few things worth knowing:

- **Both of you need an account** (see "Setting up accounts and cross-device sync" below) — a shared list lives on the server, not just in one browser.
- **Whoever shared it owns it.** The **Share list** modal shows a **Stop sharing** button for the owner, which deletes the shared list entirely for everyone on it (your own copy of its sections/tasks stays — it just goes back to being a normal personal page). Anyone else on it gets a **Leave this shared list** button instead, which removes it from their account only.
- **It's grocery lists first, but works for any page** — including a Family Calendar page. The original ask behind this feature was a shared grocery list with a partner, but there's nothing grocery-specific about it — share a to-do page the same way if that's useful (client/value tags and due dates carry over and sync too), or share a Family Calendar page to get the live, multi-person calendar described below.
- **Last-write-wins still applies within a single edit**, same as the regular device-to-device sync — if you both somehow change the exact same task at the exact same instant, whichever save reaches the server a moment later wins. In normal use (one of you adding milk while the other checks off bread) this never comes up, since you're touching different rows.
- **Deleting the page** (rather than using Stop sharing/Leave) does the right thing too — it unshares or leaves first, then deletes locally, so you don't end up with an orphaned shared list nobody's managing.

## Family Calendar

Add a page and choose **Family calendar** as its type, and instead of a checklist you get a month grid — built for a family (or any small group) to see the same calendar and each other's updates to it, live, the same way a shared list stays in sync.

**Freestanding events.** Use the quick-add form above the grid to add an event right on the calendar — a date (required) and, optionally, a time. It doesn't need to belong to any to-do list at all; that was the whole point of this page type over just reusing a to-do list's due dates. Click a day to pick which date the form adds to next, or jump straight to today with the **Today** button next to the month name. An event you added here can be renamed in place (click its text) or removed (the **×**); checking it off just dims it, same spirit as checking off a task.

**Cells never change size or shape.** A packed day doesn't stretch its cell, squish its neighbors, or throw the grid out of alignment — every cell on the grid is always the same fixed size, full stop. Once a day has more events than comfortably fit, the rest collapse into a **"+N more"** link instead of piling up; clicking it opens a popup with that day's complete list, fully interactive (check things off, rename, delete) and not truncated at all. The cap is a handful of events per cell (fewer on a phone-width screen, where cells are narrower) — plenty for a normal day, and anything busier is one click away in the popup rather than warping the calendar around it.

**Every day with anything on it can open the same popup, not just busy ones.** A small 👁️ view button appears in the corner of any day that has at least one event — even just one — so there's always a way to open that day's full detail view, whether it's a single light event or an overflowing one. (A day that's already overflowing shows "+N more" instead, which does the same job; the view button only shows up when that button isn't already there.)

**Events can repeat, the same way a to-do task can.** The quick-add form's **Repeat** dropdown offers the same options as a task's recurrence — every day, every weekday, weekends only, weekly, monthly, or custom specific days. Pick one and the event shows up on every matching date across the visible month, not just the date it was created on. One deliberate scope limit here, worth knowing: only the date you actually created the event on (its "anchor") is a real, editable row — every other date it projects onto is a read-only preview (dashed border, no checkbox, can't be renamed or deleted from there). Checking it off, retyping its text, or deleting it only ever works from its anchor date; that keeps "one event, repeating" from quietly turning into dozens of separate rows to manage. This was a deliberate corner cut to ship the feature without also reworking how recurrence spawns rows elsewhere in the app — a to-do task's Repeat still creates one new real row each time you complete it (see "Daily tasks and flexible recurrence" above), which is a different mechanism on purpose.

**US holidays, shown automatically.** Major US holidays (New Year's Day, MLK Day, Presidents' Day, Easter, Memorial Day, Juneteenth, Independence Day, Labor Day, Columbus Day, Thanksgiving, Christmas, and a handful of other commonly-observed ones — 19 in total) appear right on their date, every year, computed on the fly rather than from a list someone has to update — so next year's calendar already has them too, with no maintenance. A holiday's name shows as a small label under the day number; click it to open that day's popup for the full event list alongside the holiday name. A holiday counts toward that cell's event cap like anything else, so a holiday that lands on a busy day still respects the same "cells never change size" rule above — the label and a couple of events show, and the rest fold into "+N more" same as usual.

**Linking a list, any time, not just at creation.** The **Linked lists** button (next to Share list, on a calendar page) lets you link any existing to-do or grocery list to the calendar — its open due dates show up on the grid alongside the calendar's own events, tagged with which list they came from (click that tag to jump straight to the list). This works both ways and at any point in a calendar's life: link a list the moment you create the calendar, or months later; link more than one; unlink one without affecting anything else. A linked list's own events stay editable only on the list itself — the calendar view shows them read-only, with a jump-to-source tag instead of inline editing, since editing really belongs on the list, not a second place pretending to be the list.

**Sharing it, and sharing what's linked to it.** A Family Calendar page shares exactly like any other page — **Share list** next to the title, same invite-code flow. Once it's shared, linking a NEW list to it asks whether you'd also like to share that list with everyone already on the calendar — say yes, and they're added to the list directly (no separate invite code for them to enter), so a calendar shared with your family and a grocery list you just linked to it can both show up for everyone in one step. Say no, and the list still shows up on the grid for you, just not for anyone else yet — nothing is forced.

**One deliberate scope limit, worth knowing:** a shared calendar's set of linked lists is deliberately *not* pushed over realtime the way checking off a task is — it's resolved when a member opens that calendar page (or signs back in), not the instant someone else links something. In practice this means: if someone else links a new list to a calendar you're both on, you'll see it next time you open that calendar page rather than the second they click Link. This was a deliberate corner cut to keep the feature shippable — the underlying due dates and events on anything already linked still sync live same as ever, it's only the *list of which lists are linked* that catches up on open instead of instantly.

## Deploying the live calendar, shared lists, and the Family Calendar

These three features need a couple of new database tables and one small Edge Function, on top of the account/sync setup in the next section. Do this once, in the same Supabase project:

1. **Run the extra SQL, in this order.** In the SQL Editor, run everything in `shared-lists-schema.sql` (shared lists) first, then `live-calendar-schema.sql` (the live calendar), then `family-calendar-schema.sql` (the Family Calendar's calendar-type pages, linked-lists, and event times — it builds on top of the shared-lists tables, so it has to go last). All three files are in this folder, with comments explaining each piece — none of them touches the `app_state` table or its policy from the main setup below.
2. **Deploy the Edge Function.** This one piece needs the [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`, then `supabase login`). From this project's folder:

   ```bash
   supabase link --project-ref your-project-ref   # find this in your project's URL/settings
   supabase functions deploy ics-feed
   ```

   That's it — no secrets to configure by hand. Supabase automatically gives every Edge Function its project URL and a service-role key, which is what `supabase/functions/ics-feed/index.ts` uses to look up a calendar link's owner and read their tasks.
3. Reload the app (or redeploy, if it's already hosted). **Share list** and **Get my calendar link** now work instead of showing the "not set up" message.

This environment couldn't connect to a live Supabase project to test the actual deployed function or a real two-account round trip against it — the sharing/mapping logic itself is unit-tested (see `test-shared-lists-unit.mjs`), the UI's gating/rendering is tested in a real browser (`test-shared-lists-e2e.mjs`, `test-family-calendar-e2e.mjs`), and the `.ics` builders' timed-vs-all-day logic is unit-tested too (`test-ics.mjs`). But "two real accounts editing the same list," "a calendar app actually polling the live link," and — new with the Family Calendar — "linking a list on an already-shared calendar actually grants the other members access, and the linked list shows up for them" are all worth trying by hand once this is deployed, the same way the account-sync checkbox fix below asks you to double-check.

## Syncing across devices

There are two ways to move data between browsers/computers, and you can use either one independently of the other.

**Manual, no setup required:** open **Settings → Your data → Export JSON** on the source browser to download a backup, then **Settings → Your data → Import JSON** on the destination browser to load it. Works today, no accounts involved.

**Automatic, via a free Supabase account (real login + sync):** set up once, below, and from then on anyone using the app can create an account and have their sections/tasks follow them to any browser they sign into.

### Setting up accounts and cross-device sync

**This has already been done once for the live instance** — it's documented here as a runbook, not something to repeat for every user or every sale. This is the one feature that needs something outside the browser — a place to hold accounts and everyone's data. [Supabase](https://supabase.com) provides that as a free hosted service (login + a small Postgres database), so you don't have to build or run a server yourself. Everyone using the live link shares this one project; your users just see a normal "sign up / log in" box in the app, with nothing to configure.

1. **Create a project.** Go to supabase.com, sign up, and create a new project (pick any name/region; the free tier is plenty for an app like this).
2. **Create the data table.** In your project, open the **SQL Editor** and run:

   ```sql
   create table app_state (
     user_id uuid primary key references auth.users(id) on delete cascade,
     data jsonb not null,
     updated_at timestamptz not null default now()
   );

   alter table app_state enable row level security;

   create policy "Users manage their own state"
     on app_state
     for all
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);

   alter publication supabase_realtime add table app_state;
   ```

   This makes one row per user, holding their whole task list as a single JSON blob, and locks it down so a user can only ever read or write their own row — Supabase enforces that server-side, it isn't something the app's JavaScript has to get right on its own. The last line turns on realtime updates, which is what lets a second device pick up a change within a second or two of it happening, without a page refresh.

3. **Turn off "Confirm email" if you want signups to work immediately** (optional). By default Supabase sends a confirmation email before a new account can log in. For a quick personal/small-scale setup without email sending configured, go to **Authentication → Providers → Email** and turn off "Confirm email." For a real public launch, you'd instead want to configure a proper email sender there.
4. **Get your API credentials.** Go to **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
5. **Paste them into the app.** Open `supabase-config.js` and replace the two placeholder strings:

   ```js
   export const SUPABASE_URL = "https://xxxxxxxxxxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJ...";
   ```

6. Save the file, then reload the page if you're testing locally, or redeploy (push to GitHub / re-upload) if it's already hosted. That's it — the Settings modal now shows a working **Account & sync** section instead of the "not set up" message.
7. **Run `account-deletion-schema.sql`** (in the SQL Editor, any time after step 2 — it doesn't depend on the shared-lists/live-calendar/family-calendar tables, it just cascades through whichever of those you've also set up). This backs the **Delete my account and data** button that appears once someone's signed in. Almost all of the actual cleanup is already handled by the `on delete cascade` foreign keys already in place from the setup above and from `shared-lists-schema.sql`/`live-calendar-schema.sql`/`family-calendar-schema.sql` if you've run those — deleting the `auth.users` row is the one piece a client can't do on its own (that table isn't writable by a normal logged-in user), so this one `security definer` function does just that, and everything else — their `app_state` row, their live-calendar token, any shared list or calendar they own (which also removes it for everyone else on it) or merely belong to (which just drops their own membership) — cleans up automatically behind it.

**A note on a recent fix:** earlier versions could occasionally show a checkbox snap back to checked right after you unchecked it (or vice versa), when syncing was turned on — a race between your own change being saved and the app receiving its own change back over realtime and mistaking it for someone else's edit. That's been rewritten to compare against what the server actually confirms was saved, rather than guessing, and to not apply an incoming update while one of your own is still in flight. It's been checked carefully against the sync code's logic, but this environment couldn't connect to a live Supabase project to test it against the real thing — if you still see the checkbox-revert behavior after updating, let me know and I'll dig further.

A few honest limitations of this v1 sync, worth knowing:

- **Last write wins.** If you edit the same account from two devices while both are offline-ish or at the exact same moment, whichever save lands last overwrites the other — there's no merge of conflicting edits. For one person using their own account across a couple of their own computers (the normal case), this is rarely an issue in practice.
- **The anon key is meant to be public.** It ships inside the app's JavaScript on purpose — that's how every Supabase client-side app works. The Row Level Security policy above is what actually protects user data, not keeping that key secret.
- **No password-reset flow is wired up yet.** Supabase supports it, but this app doesn't have a "forgot password" UI — that'd be a follow-up if you want it.
- Signing out stops syncing but doesn't erase the local copy in that browser, so the app keeps working offline with whatever was last synced.
- **Deleting your account is permanent and immediate.** The button lives right below Sign out, needs a second click to confirm (same "click again" pattern as deleting a page or section), and once confirmed it's gone server-side straightaway — there's no grace period or recovery. This environment couldn't test the actual Supabase RPC call against a live project (same limitation as the rest of this section), but the SQL function itself is the same proven pattern Shiny Ledger uses, and the confirm/cancel UI mechanics are straightforward enough to verify just by trying it.

If you'd rather use Firebase instead of Supabase, the same idea applies (auth + a cloud document per user) — `sync.js` is the one file that would need rewriting to call Firebase's SDK instead; nothing else in the app depends on which backend you pick.

## Add it to your home screen

Venture Tasks is a PWA (progressive web app), so it installs to a phone's home screen — or a desktop's dock/taskbar — like a real app: its own icon, its own window with no browser chrome, and it keeps working with no signal once it's been opened at least once. The icon is the same orange tab icon throughout, whether it's the browser tab, the home-screen badge, or the app-switcher thumbnail.

- **iPhone (Safari):** open the site → tap the Share icon → **Add to Home Screen**.
- **Android (Chrome):** open the site → tap the **⋮** menu → **Install app** (or Chrome may offer an install banner on its own).
- **Desktop (Chrome/Edge):** an install icon appears at the right edge of the address bar; click it → **Install**.

Behind the scenes this is `manifest.webmanifest` (name, icons, colors) plus `sw.js`, a small service worker that caches the app's own files so they load instantly and still work offline — it never caches your actual data, which already lives in `localStorage`/Supabase, never in this cache. **If you redeploy an update**, bump the `VERSION` string at the top of `sw.js` (e.g. `"v1"` → `"v2"`) — that's what tells installed copies to fetch the new files instead of quietly keeping the old cached ones forever.

## Project structure

```
index.html             Markup + the settings modal — loads app.js as an ES module
styles.css              All styling (light/dark via prefers-color-scheme, plus font/color overrides)
store.js                localStorage data layer (pages, sections, tasks — including calendar pages' linkedListIds and a task's optional eventTime — settings, undo, export/import, replaceState)
dates.js                Date/due-date/recurrence helper functions
ai.js                   Provider-agnostic AI dispatcher
claude.js, openai.js, gemini.js   One file per AI provider — direct REST calls
supabase-config.js      Your Supabase project URL + anon key (placeholders until you set it up)
sync.js                 Optional account/cloud-sync logic (auth, push/pull, realtime), shared-list sharing/joining, live-calendar-token logic, and the Family Calendar's list-linking/cross-sharing logic — no-ops until configured
ui.js                   Rendering (tabs, sections, tasks/grocery items, the Family Calendar's fixed-size month grid + day-overflow popup + US holiday labels), the cross-page Today view, the share-list and linked-lists modals, drag-and-drop, touch reordering, list search + smart-Enter add/check/uncheck, the hide-done toggle, grocery auto-categorization (keyword map + AI fallback) on quick-add and voice-add, AI action wiring
voice.js                Voice commands: microphone wrapper (Web Speech API) + phrase parsing/matching
holidays.js             Computes US holiday dates for any year with plain date math (no API, no yearly data file to maintain)
categorize.js           Built-in keyword map that guesses a grocery item's category; AI fallback for anything it doesn't recognize is called from ui.js
ics.js                  Builds the one-time .ics calendar export from current due dates (timed when a Family Calendar event has a time set, all-day otherwise)
settings.js             Settings modal logic (AI connection, account/sync, join-a-shared-list, live-calendar link, appearance/theme picker, export/import)
theme.js                Font options list + applying the active theme/font/color overrides to the page (DOM-touching half of the theme system)
themes.js               The 30 built-in theme presets + the pure color math (lighten/mix/pickInk) that expands one into a full set of CSS variables (DOM-free half of the theme system, easy to unit test on its own)
undo.js                 Global Ctrl+Z / Cmd+Z handler
app.js                  Entry point — wires everything together, registers sw.js
manifest.webmanifest   PWA manifest (name, icons, colors) for "Add to Home Screen"
sw.js                   Service worker: caches the app's own files for offline use + fast loading (bump VERSION on every deploy)
icon.svg, icon-192.png, icon-512.png, apple-touch-icon.png, favicon.ico   App icon, in every size a browser/OS/manifest actually asks for
shared-lists-schema.sql       SQL to run once for shared lists (tables + row-level security + the invite-code join function)
live-calendar-schema.sql      SQL to run once for the live calendar (the token table)
family-calendar-schema.sql    SQL to run once for the Family Calendar (calendar-type pages, linked-lists, event times, and the cross-share functions) — run after the two above
account-deletion-schema.sql   SQL to run once for the "Delete my account and data" button (one function that deletes the auth.users row; everything else cascades)
supabase/functions/ics-feed/index.ts   The one server piece: an Edge Function that serves a live .ics feed by token
```

Everything the browser actually loads sits directly in this one folder on purpose, with no subfolders — GitHub's drag-and-drop uploader doesn't reliably preserve nested folders, and a 404'd `css/` or `js/` path is the single most common way this kind of app silently breaks when hosted. One flat folder means there's nothing to get wrong when uploading or re-uploading files. The one exception is `supabase/functions/ics-feed/`, which isn't part of the hosted site at all — it's deployed separately, straight to Supabase, with the CLI command in "Deploying the live calendar and shared lists" above. It can sit right here in the repo for convenience without affecting GitHub Pages hosting; it's just never uploaded as a static file.

## Browser support

Any modern evergreen browser (Chrome, Edge, Firefox, Safari) released in the last few years, on desktop or mobile. It uses standard ES modules, `localStorage`, native `<input type="color">` and `<input type="date">`, and the HTML5 drag-and-drop API (desktop only — touch devices get up/down buttons instead, see "Mobile-friendly" above) — no polyfills, no framework, no dependencies to install for end users. The one feature with uneven support is **voice commands**, which relies on the Web Speech API: it works in Chrome, Edge, and Safari, but Firefox hasn't implemented it — everything else in the app is unaffected there. The **Copy** buttons on the invite code and live-calendar link use the clipboard API, which requires a secure context (plain `https://`, which GitHub Pages already is, or `localhost` while testing) — on the rare page served over plain `http://`, copying will fail and the status message will say to select and copy by hand instead.
