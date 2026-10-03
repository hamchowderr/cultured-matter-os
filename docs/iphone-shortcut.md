# Capture to the Inbox from an iPhone

Two Shortcuts send things straight to the Cultured Matter OS Inbox: one for words (spoken or typed), one for photos. Everything lands under **To sort** in the Inbox.

## How this is set up

The app owner builds both Shortcuts once on an iPhone, with the capture key already inside, tests them, and shares them with Simone once as iCloud links. Simone only taps each link and **Add Shortcut**; she never handles the key. Because the key is inside the Shortcuts, anyone with the links could send to her Inbox: share them only with her, and change the key (below) if a link is ever passed on.

The address both Shortcuts send to:

```
https://cultured-matter-os.vercel.app/api/capture
```

## For Simone: install from the links

You get two links: **Capture** and **Capture Photo**. They are ready to use. Keep them to yourself.

1. On your iPhone, tap the **Capture** link. It opens in the Shortcuts app.
2. Tap **Add Shortcut**.
3. Do the same with the **Capture Photo** link.
4. Test: tap **Capture**, say something, and wait for "Saved to your Inbox." Then tap **Capture Photo** and pick a photo. Both appear in the app's Inbox under **To sort**.

## For the owner: build once, then share

You need the capture key from Infisical (otaku-internal, environment **Production**, folder `cultured-matter-os`, `CAPTURE_TOKEN`). Infisical opens on Development, whose key does not work against the live app.

The key goes in the Form as a field named `key`, not in a header. Pasting into a header can carry hidden characters, and iOS then drops the request with "The network connection was lost".

### Shortcut 1: Capture (words)

1. Open **Shortcuts**. Tap **+** at the top right.
2. Tap the name at the top and call it **Capture**.
3. In the search bar at the bottom, search for **Dictate Text** and tap it. (To type instead of speak, use **Ask for Input** with input type **Text**.)
4. Search for **Get Contents of URL** and tap it.
5. Tap the blue **URL** in that action and enter the address above.
6. Tap the **>** arrow on the action to show more options.
7. **Method**: tap it and choose **POST**.
8. **Headers**: leave empty.
9. **Request Body**: choose **Form**.
10. Tap **Add new field**, choose **Text**.
    - Key: `key`
    - Value: paste the capture key.
11. Tap **Add new field** again, choose **Text**.
    - Key: `text`
    - Value: tap it, then pick the **Dictated Text** variable from the bar above the keyboard (or **Provided Input** if you used Ask for Input).
12. Search for **Show** and add **Show Result** (or **Show Notification** if your iPhone has no Show Result; it fills in **Contents of URL** by itself and the title can stay blank). It shows "Saved to your Inbox." when it worked.
13. Tap **Done**, then tap the Shortcut to test it.

Do not add a `Content-Type` header. Shortcuts sets it for you.

### Shortcut 2: Capture Photo

1. Tap **+** to make a new shortcut and call it **Capture Photo**.
2. Add **Select Photos** (pick from your library) or **Take Photo** (use the camera).
3. Add **Convert Image**. Set it to **JPEG**. (iPhone photos are HEIC by default, which most computer browsers cannot show.)
4. Add **Resize Image** and set the width to **2000**. Photos above about 4 MB are refused, and this keeps them well under.
5. Add **Get Contents of URL** and set it up as in Shortcut 1 steps 5 to 10 (same address, POST, Request Body **Form**, the same `key` field).
6. Tap **Add new field**, choose **File**.
   - Key: `photo`
   - Value: pick the **Resized Image** variable.
7. Optional caption: add **Ask for Input** before step 5, then add a second **Text** field with key `text` and the **Provided Input** variable.
8. Add **Show Result** (or **Show Notification**) at the end. Tap **Done** and test it.

### Share the links

1. In the Shortcuts list, long-press the Shortcut and tap **Share**.
2. Tap **Copy iCloud Link**.
3. Send Simone both links privately. The key travels inside them, so send them only to her.

## Using them

- Tap the shortcut in the Shortcuts app, add it to your Home Screen (share button on the shortcut, then **Add to Home Screen**), or say "Hey Siri, Capture".
- Open the Inbox in the app. New items are under **To sort**. Photos show inside the item; click a photo to open it full size.

## If something goes wrong

| What the Shortcut shows                       | What it means                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Saved to your Inbox.                          | It worked.                                                                                                                               |
| Unauthorized. Check the key in your Shortcut. | The key is missing or wrong. Check the Form field is named `key` and holds the Production key.                                           |
| The network connection was lost.              | The request never left the phone. Usually a key pasted into a header with a hidden character: remove the header and use the `key` field. |
| Nothing to capture. Send text or a photo.     | The text was empty, or the photo field is not named `photo`.                                                                             |
| That file isn't a photo.                      | The `photo` field holds something other than an image.                                                                                   |
| That photo is too big.                        | Add the **Resize Image** step (Shortcut 2, step 4).                                                                                      |

## Changing the key

If the key leaks, the app owner changes `CAPTURE_TOKEN` in the app settings and sends you the new key. Each person opens their Shortcuts, taps the `key` field value, and pastes the new key. The old key stops working straight away.

## For the developer

- Endpoint: `POST /api/capture` (`app/api/capture/route.ts`, logic in `lib/capture.ts`). Public in `proxy.ts`; authenticated by a `key` field in the Form or JSON body, or `Authorization: Bearer <CAPTURE_TOKEN>`, with a constant-time compare. The whole body is read before replying, because an early reply makes iOS show "The network connection was lost". With `CAPTURE_TOKEN` unset, every request gets 401.
- Accepted bodies: Form (`text`, `photo`), JSON (`{"text": "..."}`), plain text, or a raw image (`image/*`, or `application/octet-stream` with JPEG/PNG/HEIC bytes).
- Photos go to Vercel Blob with `access: "private"` and a random suffix (`BLOB_READ_WRITE_TOKEN`), and the pathname is stored in `captures.image_path`. The Inbox loads them through `GET /api/photos/<captureId>`, which requires a signed-in session.
- Each capture is written through the `createCapture` action and logged in `activity_log` as "Captured ... from the iPhone".
- Test from a terminal (key injected from Infisical, never typed):

  ```
  curl -X POST https://cultured-matter-os.vercel.app/api/capture -H "Authorization: Bearer $CAPTURE_TOKEN" -F "text=Test from curl"
  curl -X POST https://cultured-matter-os.vercel.app/api/capture -H "Authorization: Bearer $CAPTURE_TOKEN" -F "photo=@photo.jpg;type=image/jpeg"
  ```
