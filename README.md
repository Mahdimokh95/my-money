# My Money — put it on your iPhone

All your data stays **on your iPhone only**. The files below are just the app itself.

## 1. Put the files online (free, one time, ~10 minutes)
The iPhone needs to open the app once from an `https://` address. The easiest free way is GitHub Pages:

1. Create a free account at **github.com**.
2. Tap **+ → New repository**, name it `my-money`, set it to **Public**, and create it.
3. Tap **Add file → Upload files** and upload **all** files from this folder:
   `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `icon-180.png`, `icon-512.png`.
   Then tap **Commit changes**.
4. Go to **Settings → Pages**. Under "Branch", choose **main** and **/ (root)**, then tap **Save**.
5. After 1–2 minutes your app is at `https://YOUR-USERNAME.github.io/my-money/`

The code is public, but **your money data is never uploaded**. It stays on your phone.

(Alternatives: Cloudflare Pages or Netlify, where you drag and drop the folder.)

## 2. Install on iPhone
1. Open the link in **Safari** (it has to be Safari).
2. Tap **Share** (□↑) → **Add to Home Screen** → **Add**.
3. From now on, **always open the app from the Home Screen icon.**
   (Safari and the Home Screen app keep separate data on iPhone.)

It works offline, doesn't expire, and doesn't need to be refreshed.

## 3. First steps
- **More → Accounts:** set the starting balance of Cash and Girokonto, and add your other cards or accounts.
- **More → Bills & recurring:** add rent, phone, insurance, subscriptions, and salary.
- **More → Loans:** add bank loans and money you lent to or borrowed from friends.
  For Klarna / PayPal pay-later purchases choose **🛍️ Bought something**: enter the total incl. interest and, if it started earlier, what is left today.
- **More → Budgets:** set monthly limits (optional).
- **More → Settings → Categories:** add your own categories and subcategories at any depth
  (e.g. Groceries › Edeka › Dairy). There are tabs for Expenses, Income and Transfers.
- **More → Settings → Payment methods:** add Mastercard, Visa, PayPal, Apple Pay… and link each one to an account.
- Tap **＋** to add an expense or income in a few seconds. While adding, the dashed **＋** chip creates a new subcategory on the spot.

## 4. Backups (important!)
Go to **More → Backup & data → Back up now → Save to Files → iCloud Drive** every week or two.
If the phone is lost or the app is deleted, a backup is the only way to get your data back.
To restore, use **Restore from backup** and pick the file.

## Updating the app later
Upload the changed files to GitHub again and change `VERSION` in `sw.js` (for example to `my-money-v2`).
Open the app twice, and the new version loads. Your data is kept.
