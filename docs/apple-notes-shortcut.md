# Import Apple Notes into the Notes archive

One Shortcut copies Simone's Apple Notes into Cultured Matter OS. They land in **Archive → Notes**, not in the Inbox. There she can search them, filter by folder and date, open one, and tap **File to Inbox** to sort a note as a task, idea or reference.

The import can run as often as you like. A note that is already in the archive is not added again. A note edited since the last run is updated.

## How this is set up

The app owner builds the Shortcut once on his iPhone, with the capture key already inside. He tests it, then shares it with Simone as an iCloud link. Simone only taps the link and **Add Shortcut**; she never handles the key. The key is the same one the capture Shortcuts use. Anyone with the link could send notes to her archive, so share it only with her. If a link is ever passed on, change the key (see the capture guide, `docs/iphone-shortcut.md`).

The address the Shortcut sends to:

```
https://cultured-matter-os.vercel.app/api/apple-notes
```

## What comes across

| From Apple Notes   | In the archive                                                     |
| ------------------ | ------------------------------------------------------------------ |
| Name (first line)  | Title                                                              |
| Body               | Text, as plain text. Checklists and lists come through as lines.   |
| Folder             | Folder                                                             |
| Creation Date      | Created date (the date filter uses this)                           |
| Last Modified Date | Edited date (used to spot notes changed since the last run)        |
| Locked notes       | The title only. The text of a locked note never leaves the iPhone. |
| Photos, drawings   | Not imported. Only the words come across.                          |

Shortcuts gives no fixed ID for a note. The app recognises a note again by its creation time and its title. Two things follow:

- If the **first line** of a note is changed, the next run adds it as a new note. The old copy stays in the archive.
- Moving a note to another folder, or editing anything below the first line, updates the existing copy.

## For Simone: install from the link

1. On your iPhone, tap the **Import Apple Notes** link. It opens in the Shortcuts app.
2. Tap **Add Shortcut**.
3. Open Shortcuts and tap **Import Apple Notes**. The first time, iPhone asks to let it read your notes and to connect to cultured-matter-os.vercel.app. Tap **Allow** for both (choose **Always Allow** so it doesn't ask for every batch).
4. Keep the Shortcuts app open with the screen on until you see "Notes import finished". With thousands of notes this takes a few minutes. If the screen locks, iPhone pauses the Shortcut; just run it again. Notes already copied are skipped.
5. Open the app, go to **Archive**, then **Notes**.

You can run it again any time to bring over new and edited notes.

## For the owner: build once, then share

You need the capture key from Infisical (otaku-internal, environment **Production**, folder `cultured-matter-os`, `CAPTURE_TOKEN`). Infisical opens on Development, whose key does not work against the live app. The key goes in the Form as a field named `key`, never in a header.

The Shortcut collects notes in groups of 25 and sends each group in one request. That keeps it fast with thousands of notes and keeps each request well under the time limit iOS allows.

In every step, "search for" means: tap the search bar at the bottom of the Shortcut editor, type the name, and tap the action that appears.

### Build it

1. Open **Shortcuts**. Tap **+** at the top right.
2. Tap the name at the top, choose **Rename**, and call it **Import Apple Notes**.
3. Search for **Find Notes** and tap it.
   - Leave it on **All Notes**.
   - Tap **Sort by** and choose **Creation Date**. Set **Order** to **Oldest First**.
   - For your first test only: turn on **Limit** and set it to **5**. (To test on a folder of throwaway notes instead, tap **Add Filter**, choose **Folder**, and pick that folder.)
4. Search for **Repeat with Each** and tap it. It repeats over **Notes** by itself.
5. Search for **Dictionary** and tap it. It goes inside the repeat (between **Repeat with Each** and **End Repeat**). If it lands below **End Repeat**, drag it up.
6. In the Dictionary, tap **Add new item** and choose **Text** five times, to make five rows. Fill them in:
   - Key `title`. Value: tap it, tap **Repeat Item** in the bar above the keyboard, then tap the blue **Repeat Item** token and choose **Name**.
   - Key `body`. Value: **Repeat Item**, then tap the token and choose **Body**.
   - Key `folder`. Value: **Repeat Item**, then choose **Folder**.
   - Key `created`. Value: **Repeat Item**, then choose **Creation Date**. Tap the token again, set **Date Format** to **ISO 8601**, and turn on **Include ISO 8601 Time**.
   - Key `modified`. Value: **Repeat Item**, then choose **Last Modified Date**. Set **Date Format** to **ISO 8601** with **Include ISO 8601 Time** on, as above.
7. Search for **Add to Variable** and tap it (still inside the repeat). Tap **Variable Name** and type `Batch`. It adds the **Dictionary** by itself.
8. Search for **Count** and tap it. Tap the input and pick the **Batch** variable, so it reads "Count **Items** in **Batch**".
9. Search for **If** and tap it. It checks **Count**. Tap **Condition**, choose **is**, and type `25`.
10. Between **If** and **Otherwise**, add these, in order:
    1. Search for **Text** and tap it. Tap inside the text box and pick the **Batch** variable.
    2. Search for **Get Contents of URL** and tap it. Tap the blue **URL** and enter the address above. Tap the **>** arrow to show more options.
       - **Method**: **POST**.
       - **Headers**: leave empty.
       - **Request Body**: **Form**.
       - **Add new field** → **Text**. Key `key`, value: paste the capture key.
       - **Add new field** → **Text**. Key `notes`, value: pick the **Text** variable from step 10.1.
    3. Search for **Nothing** and tap it.
    4. Search for **Set Variable** and tap it. Set **Variable Name** to `Batch`. Its input is **Nothing**, which empties the group for the next 25.
11. Delete the **Otherwise** part if it bothers you; it can stay empty.
12. After **End Repeat** (at the very bottom), send the last group of fewer than 25:
    1. Search for **If** and tap it. Tap its input and pick **Batch**. Set the condition to **has any value**.
    2. Between this **If** and its **Otherwise**, add **Text** with the **Batch** variable, then **Get Contents of URL** set up exactly as in step 10.2. (Long-press the earlier **Get Contents of URL**, tap **Duplicate**, and drag the copy here. Then point its `notes` field at this new **Text**.)
13. At the very bottom, search for **Show Notification** and tap it. Type `Notes import finished`.
14. Tap **Done**.

Do not add a `Content-Type` header. Shortcuts sets it for you.

If tapping the **Repeat Item** token shows no **Name**, **Body** or **Folder**, add **Get Details of Notes** inside the repeat first and pick each detail from it instead.

### Test it on your own notes

1. With **Limit** set to 5 (step 3), tap the Shortcut. Allow access to Notes and to the website when asked.
2. To see what the app replied, temporarily add **Show Result** right after a **Get Contents of URL**. A good reply looks like `{"ok":true,"received":5,"added":5,"updated":0,"unchanged":0,"skipped":0}`.
3. Open the app: **Archive → Notes**. Your 5 notes are there with their folders and dates.
4. Run it again. The reply now says `"added":0,"unchanged":5`, and no note appears twice.
5. Edit one of those notes below its first line, run again: `"updated":1`.
6. Remove the **Show Result** step and the **Limit** again (or Simone only gets 5 notes).

Your test notes stay in her archive. To have them removed, test with a folder of throwaway notes (step 3) and ask the developer to delete that folder's notes afterwards.

### Share the link

1. In the Shortcuts list, long-press **Import Apple Notes** and tap **Share**.
2. Tap **Copy iCloud Link**.
3. Send Simone the link privately. The key travels inside it.

## Running it on a Mac

Shortcuts syncs through iCloud, so the same Shortcut appears on a Mac signed in to the same Apple Account. A Mac does not pause the Shortcut when the screen locks, so it is the better choice for a very large first import. Open the Shortcuts app on the Mac and double-click **Import Apple Notes**.

## If something goes wrong

| What you see                                    | What it means                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `"ok":true` with counts                         | It worked. `added` are new notes, `updated` were edited since the last run, `unchanged` were already there.                     |
| `Unauthorized. Check the key in your Shortcut.` | The key is missing or wrong. Check both **Get Contents of URL** steps have a Form field named `key` holding the Production key. |
| `No notes in that request.`                     | The `notes` field is empty or not named `notes`. Check it points at the **Text** just above it.                                 |
| `Send at most 200 notes at a time.`             | The **If** in step 9 is not `is 25`, so the group never empties.                                                                |
| The network connection was lost.                | The request never left the phone. Usually a key pasted into a header; remove the header and use the `key` field.                |
| Notes appear twice                              | Their first line changed between runs (see "What comes across").                                                                |
| The Shortcut stops part way                     | The screen locked or you left Shortcuts. Run it again; finished notes are skipped. For thousands of notes, run it on a Mac.     |

## For the developer

- Endpoint: `POST /api/apple-notes` (`app/api/apple-notes/route.ts`, logic in `lib/apple-notes.ts`). Public in `proxy.ts`; authenticated with the same `CAPTURE_TOKEN` as `/api/capture` and the same key handling (`authorized` and `readForm` in `lib/capture.ts`): a `key` field in the Form or JSON body, or `Authorization: Bearer <key>`, with whitespace and zero-width characters dropped. The whole body is read before replying.
- Accepted bodies: a Form with one note's fields (`title`, `body`, `folder`, `created`, `modified`) or with a `notes` field holding the batch as JSON text (one object, an array, or objects one after another, which is what a Shortcuts list of Dictionaries turns into); JSON as one note, a list, or `{"notes": [...]}`. Field names are matched loosely (`Name`, `Creation Date` and so on also work). Dates may be ISO 8601, epoch seconds or milliseconds, or the default Shortcuts text (`Jan 4, 2025 at 9:12 AM`). An HTML body is turned into text. At most 200 notes per request.
- Reply: `200 {"ok":true,"received","added","updated","unchanged","skipped"}`; `401`, `400` or `413` with `{"ok":false,"error"}`.
- Storage: table `notes` (migration `0010_apple_notes`). `dedupe_key` is `c:<creation epoch seconds>|<title, lowercased, spaces collapsed>`, or `t:<folder>|<title>` when there is no creation date (`lib/note-dedupe.ts`). A note seen before is updated when its modified date is later, or, without dates, when its title, body or folder differ. `kind`, `tier`, `project_id`, `sector` and `personal` stay empty for the later AI suggestions. `capture_id` points at the Inbox item made with **File to Inbox**.
- Actions: `importNotes` (one `activity_log` entry per request), `searchNotes`, `getNote`, `fileNoteToInbox`.
- Test from a terminal (key injected from Infisical, never typed):

  ```
  curl -X POST https://cultured-matter-os.vercel.app/api/apple-notes -H "Authorization: Bearer $CAPTURE_TOKEN" -F "title=Test" -F "body=Test from curl" -F "folder=Notes" -F "created=2025-01-04T09:12:33-08:00"
  curl -X POST https://cultured-matter-os.vercel.app/api/apple-notes -H "Authorization: Bearer $CAPTURE_TOKEN" -H "Content-Type: application/json" -d '{"notes":[{"title":"A","body":"a"},{"title":"B","body":"b"}]}'
  ```

- Removing test notes: `delete from notes where folder = '<test folder>'` against the production database.
