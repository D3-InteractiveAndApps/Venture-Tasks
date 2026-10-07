# Venture Tasks

A to-do list for someone running several small businesses or projects at once — organized into Pages (tabs) and sections per venture, with drag-and-drop, color coding, due dates, recurring tasks, a "someday" bucket, per-venture health stats, a grocery-list page type, undo, a font/color-customizable appearance, and an optional AI co-pilot you connect yourself.

It's a static site: plain HTML, CSS, and JavaScript (ES modules), no build step, no database of its own to run. Everything you enter is stored in your browser's `localStorage`, unless you turn on the optional account/sync feature below.

## Features

- **Pages**, switched via tabs across the top — e.g. keep "Professional Tasks" and "Daily Life" completely separate, each with its own sections and its own heading (click the big title at the top to rename the active page). Add as many as you like with the **+** tab; delete the current one with the **Delete page** button next to the title (there's always at least one page left).
- Two page types, chosen when you add a page: a regular **to-do list**, or a **grocery list** — a stripped-down item type (name, category, checkbox, color only — no due dates, recurrence, someday, or AI) organized into categories you name yourself (Produce, Dairy, Hardware, whatever fits), with a category picker right on each item so you can reassign it anytime.
- Sections (or, on a grocery page, categories) freely added, renamed, color-coded, collapsed, and reordered by drag-and-drop.
- Tasks within a section: add, check off, color-code, drag between sections, and now also **drag to reorder within the same section** — drop above or below any task to place it exactly there.
- Checking off a task on a to-do page gets a small "nice work" animation (not shown on grocery lists, where checking items off is just... checking items off).
- **Undo** — Ctrl+Z (Cmd+Z on Mac) undoes your last change: adding/deleting/checking a task, renaming a section, reordering, etc. It stays out of the way while you're typing in a text field, so normal text-undo still works there.
- **Appearance**, in Settings: pick from several fonts (including a couple of serif/mono options), and optionally override the text, window, and background colors used throughout the app — similar in spirit to the color coding already available per section. "Reset colors" reverts to the defaults.
- Due dates with urgency badges, recurring tasks (daily/weekly/monthly — completing one automatically creates the next occurrence), and a "someday" bucket for tasks with no timeline (to-do pages only).
- A small health strip per section (open tasks, overdue count, days since last activity) on to-do pages.
- An optional AI co-pilot, off by default. Connect your own Claude, ChatGPT, or Gemini API key in Settings to get: a task breakdown into subtasks, a first-draft reply/outline for a task, "what's blocking this" suggestions, and a weekly review that summarizes the active page's sections.
- Optional accounts with real cross-device sync (via a free Supabase project you set up once — see below), so a user can sign up, sign in on another computer, and see the same pages/sections/tasks. Works fully without this too, storing data on-device only.
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

## Hosting it for free — GitHub Pages

1. Create a new GitHub repository and upload every file from this folder into it — they're all meant to sit directly in the repo root, with no subfolders (see "Project structure" below for why).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch", pick your main branch and the `/ (root)` folder, then save.
4. GitHub will give you a URL like `https://<your-username>.github.io/<repo-name>/`. That's the live app — share that link with anyone.

No backend, no environment variables, no build step required. Updates are just a new commit/push.

## Selling it (e.g. on Gumroad)

Gumroad sells files, not live sites, so you have two reasonable options:

- **Zip and sell the source.** Zip this whole folder and upload the zip as the Gumroad product. The buyer unzips it and either runs it locally (see above) or hosts their own copy on their own GitHub Pages/Netlify/etc. Simple, and it matches how a lot of small no-backend tools are sold.
- **Host a live demo yourself, sell access/licensing.** Put a hosted copy (e.g. on GitHub Pages) up as a free demo/landing page, and sell a license key, a paid version with extra features, or just charge for the zip via Gumroad while linking the live demo as the preview.

Either way, there's no license-key enforcement built in right now — if you want to gate features behind a purchase, that's an enhancement to design separately (it would need some kind of lightweight backend or a licensing service, since a pure static site can't verify a purchase on its own).

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

## Syncing across devices

There are two ways to move data between browsers/computers, and you can use either one independently of the other.

**Manual, no setup required:** open **Settings → Your data → Export JSON** on the source browser to download a backup, then **Settings → Your data → Import JSON** on the destination browser to load it. Works today, no accounts involved.

**Automatic, via a free Supabase account (real login + sync):** set up once, below, and from then on anyone using the app can create an account and have their sections/tasks follow them to any browser they sign into.

### Setting up accounts and cross-device sync

This is the one feature that needs something outside the browser — a place to hold accounts and everyone's data. [Supabase](https://supabase.com) provides that as a free hosted service (login + a small Postgres database), so you don't have to build or run a server yourself. This is a one-time setup on your end; your users just see a normal "sign up / log in" box.

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

A few honest limitations of this v1 sync, worth knowing:

- **Last write wins.** If you edit the same account from two devices while both are offline-ish or at the exact same moment, whichever save lands last overwrites the other — there's no merge of conflicting edits. For one person using their own account across a couple of their own computers (the normal case), this is rarely an issue in practice.
- **The anon key is meant to be public.** It ships inside the app's JavaScript on purpose — that's how every Supabase client-side app works. The Row Level Security policy above is what actually protects user data, not keeping that key secret.
- **No password-reset flow is wired up yet.** Supabase supports it, but this app doesn't have a "forgot password" UI — that'd be a follow-up if you want it.
- Signing out stops syncing but doesn't erase the local copy in that browser, so the app keeps working offline with whatever was last synced.

If you'd rather use Firebase instead of Supabase, the same idea applies (auth + a cloud document per user) — `sync.js` is the one file that would need rewriting to call Firebase's SDK instead; nothing else in the app depends on which backend you pick.

## Project structure

```
index.html             Markup + the settings modal — loads app.js as an ES module
styles.css              All styling (light/dark via prefers-color-scheme, plus font/color overrides)
store.js                localStorage data layer (pages, sections, tasks, settings, undo, export/import, replaceState)
dates.js                Date/due-date/recurrence helper functions
ai.js                   Provider-agnostic AI dispatcher
claude.js, openai.js, gemini.js   One file per AI provider — direct REST calls
supabase-config.js      Your Supabase project URL + anon key (placeholders until you set it up)
sync.js                 Optional account/cloud-sync logic (auth, push/pull, realtime) — no-ops until configured
ui.js                   Rendering (tabs, sections, tasks/grocery items), drag-and-drop, AI action wiring
settings.js             Settings modal logic (AI connection, account/sync, appearance, export/import)
theme.js                Font options list + applying the font/color overrides to the page
undo.js                 Global Ctrl+Z / Cmd+Z handler
app.js                  Entry point — wires everything together
```

Everything sits directly in this one folder on purpose, with no subfolders — GitHub's drag-and-drop uploader doesn't reliably preserve nested folders, and a 404'd `css/` or `js/` path is the single most common way this kind of app silently breaks when hosted. One flat folder means there's nothing to get wrong when uploading or re-uploading files.

## Browser support

Any modern evergreen browser (Chrome, Edge, Firefox, Safari) released in the last few years. It uses standard ES modules, `localStorage`, native `<input type="color">` and `<input type="date">`, and the HTML5 drag-and-drop API — no polyfills, no framework, no dependencies to install for end users.
