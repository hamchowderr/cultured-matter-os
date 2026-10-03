# Capture to the Inbox from an iPhone

Two Shortcuts send things straight to the Cultured Matter OS Inbox: one for words (spoken or typed), one for photos. Everything lands under **To sort** in the Inbox.

## What you need

- The **capture key**. The person who set up the app sends it to you privately. Treat it like a password: anyone who has it can add items to your Inbox.
- The Shortcuts app (built into the iPhone).

The address both Shortcuts send to:

```
https://cultured-matter-os.vercel.app/api/capture
```

## Shortcut 1: Capture (words)

1. Open **Shortcuts**. Tap **+** at the top right.
2. Tap the name at the top and call it **Capture**.
3. Tap **Add Action**, search for **Dictate Text**, and tap it. (To type instead of speak, use **Ask for Input** with input type **Text**.)
4. Search for **Get Contents of URL** and tap it.
5. Tap the blue **URL** in that action and enter the address above.
6. Tap the **>** arrow on the action to show more options.
7. **Method**: tap it and choose **POST**.
8. **Headers**: tap **Add new header**.
   - Key: `Authorization`
   - Value: `Bearer` then one space, then paste your capture key. Example shape: `Bearer abc123...`
9. **Request Body**: choose **Form**.
10. Tap **Add new field**, choose **Text**.
    - Key: `text`
    - Value: tap it, then pick the **Dictated Text** variable (or **Provided Input** if you used Ask for Input).
11. Search for **Show Result** and add it at the end. It shows "Saved to your Inbox." when it worked.
12. Tap **Done**.

Do not add a `Content-Type` header. Shortcuts sets it for you.

## Shortcut 2: Capture Photo

1. Tap **+** to make a new shortcut and call it **Capture Photo**.
2. Add **Select Photos** (pick from your library) or **Take Photo** (use the camera).
3. Add **Convert Image**. Set it to **JPEG**. (iPhone photos are HEIC by default, which most computer browsers cannot show.)
4. Add **Resize Image** and set the width to **2000**. Photos above about 4 MB are refused, and this keeps them well under.
5. Add **Get Contents of URL** and set it up as in Shortcut 1 steps 5 to 9 (same address, POST, same Authorization header, Request Body **Form**).
6. Tap **Add new field**, choose **File**.
   - Key: `photo`
   - Value: pick the **Resized Image** variable.
7. Optional caption: add **Ask for Input** before step 5, then add a second **Text** field with key `text` and the **Provided Input** variable.
8. Add **Show Result** at the end. Tap **Done**.

## Using them

- Tap the shortcut in the Shortcuts app, add it to your Home Screen (share button on the shortcut, then **Add to Home Screen**), or say "Hey Siri, Capture".
- Open the Inbox in the app. New items are under **To sort**. Photos show inside the item; click a photo to open it full size.

## If something goes wrong

| What the Shortcut shows                       | What it means                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Saved to your Inbox.                          | It worked.                                                                                                                               |
| Unauthorized. Check the key in your Shortcut. | The key is missing or wrong. Check the header is `Authorization` and the value is `Bearer`, a space, then the key, with no extra spaces. |
| Nothing to capture. Send text or a photo.     | The text was empty, or the photo field is not named `photo`.                                                                             |
| That file isn't a photo.                      | The `photo` field holds something other than an image.                                                                                   |
| That photo is too big.                        | Add the **Resize Image** step (Shortcut 2, step 4).                                                                                      |

## Changing the key

If the key leaks, the app owner changes `CAPTURE_TOKEN` in the app settings and sends you the new key. Open each Shortcut, tap the **Authorization** header value, and replace the old key. The old key stops working straight away.

## For the developer

- Endpoint: `POST /api/capture` (`app/api/capture/route.ts`, logic in `lib/capture.ts`). Public in `proxy.ts`; authenticated by `Authorization: Bearer <CAPTURE_TOKEN>` with a constant-time compare. With `CAPTURE_TOKEN` unset, every request gets 401.
- Accepted bodies: Form (`text`, `photo`), JSON (`{"text": "..."}`), plain text, or a raw image (`image/*`, or `application/octet-stream` with JPEG/PNG/HEIC bytes).
- Photos go to Vercel Blob with `access: "private"` and a random suffix (`BLOB_READ_WRITE_TOKEN`), and the pathname is stored in `captures.image_path`. The Inbox loads them through `GET /api/photos/<captureId>`, which requires a signed-in session.
- Each capture is written through the `createCapture` action and logged in `activity_log` as "Captured ... from the iPhone".
- Test from a terminal (key injected from Infisical, never typed):

  ```
  curl -X POST https://cultured-matter-os.vercel.app/api/capture -H "Authorization: Bearer $CAPTURE_TOKEN" -F "text=Test from curl"
  curl -X POST https://cultured-matter-os.vercel.app/api/capture -H "Authorization: Bearer $CAPTURE_TOKEN" -F "photo=@photo.jpg;type=image/jpeg"
  ```
