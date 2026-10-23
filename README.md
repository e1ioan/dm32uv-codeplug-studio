# DM-32UV Codeplug Studio

**A free, unofficial, browser-based editor for Baofeng DM-32UV radio settings (`.data` files).**

No installation, no programming experience, and no connection to your radio are required. You can use it in a browser like Chrome, Edge, or Firefox. The editor works offline and your radio-settings file is handled **on your computer**, not uploaded to a server.

[**Try it online here.**](https://e1ioan.github.io/dm32uv-codeplug-studio/)

## How to use it — no technical experience needed

**Option A — use the website (recommended):** Once the maintainer has enabled GitHub Pages, click the website link above. The editor opens in your browser. You do not need to download or install anything.

**Option B — use it without internet:**

1. On GitHub, click the green **Code** button and choose **Download ZIP**.
2. Find the ZIP file in your Downloads folder. Right-click it and choose **Extract All** (Windows), or open/extract it normally on macOS/Linux.
3. Open the extracted folder. Find **`index.html`**. It is a web page stored on your computer; **HTML is simply the file type used for web pages**.
4. **Double-click `index.html`**. It should open in your normal web browser. If not, right-click it and choose **Open with → Chrome / Edge / Firefox**.
5. Click **Open .data** and select a `.data` file you previously saved with Baofeng's CPS programming software. Do not select an arbitrary file; this app cannot download settings directly from the radio.
6. Edit the **Channels**, **Zones**, **Scan lists**, **Talk Groups**, **RX Group Lists**, or **Key Settings** as needed.
7. Click **Download .data**. Your edited copy downloads with a date-and-time suffix, so the original filename isn't reused.
8. Open the downloaded file in the **official Baofeng CPS** and review it carefully before programming your radio. Keep your original file as a backup.

### What is a `.data` file?

It's a radio configuration file saved by Baofeng CPS (the manufacturer's programming application). It can contain channel frequencies, zones, scan settings, DMR group settings and button actions. This editor changes an **existing** compatible `.data` file; it does **not** create one from nothing and does **not** communicate directly with the radio.

### What can I edit?

| Section | Examples |
| --- | --- |
| Channels | Names, RX/TX frequencies, power, tones, scan-list selection; select multiple channels to edit one field across all |
| Zones | Add/remove zones, assign and reorder channels |
| Scan lists | Add/remove scan lists, assign up to **15 members** (the current monitored channel is separate) |
| Talk Groups | DMR talk-group names, IDs, call types, channel TX group assignments |
| RX Group Lists | Memberships and DMR-channel receive-group assignments |
| Key Settings | Key and knob locking, timing, and short/long programmable button actions |

Other conveniences include CSV import/export for supported lists, searching, pagination, focus mode, changed-row highlights, undo, and timestamped downloads.

## Safety and compatibility

- **Unofficial project.** Not affiliated with or endorsed by Baofeng. The binary file format has been reverse-engineered, and some record layouts or metadata remain uncertain.
- **Known format:** the supplied research/test format is a 659,456-byte `.data` file with firmware-family marker `DM32.NRF.01.049`. Other firmware families or codeplug versions may be rejected.
- **Always keep the original `.data` file.** A saved file is not guaranteed to be accepted by official CPS simply because it loads in the editor.
- **Verify edited files in CPS before programming your radio**, especially after deleting records or changing DMR, RX groups, and scan membership. Do not program unverified changes on a radio you depend on.
- **Privacy:** no backend is needed; `.data` files stay in your browser. Do not publish your personal codeplug files in GitHub repositories; they may include subscriber IDs, contacts, or stored locations.
- You are responsible for complying with radio licensing and transmission rules in your jurisdiction.

See [Technical format notes](docs/V6_FORMAT_NOTES.md) and [deletion investigation](docs/DELETE_REVERSE_ENGINEERING.md).

## For GitHub repository owners: publish the website

1. Log in to **github.com** and create a **new public repository** (for example `dm32uv-codeplug-studio`). Do not add a second README when creating it, because this ZIP already has one.
2. Unzip the package you received. Upload **the contents of the extracted folder**, not the ZIP itself, to the repository: in the repo choose **Add file → Upload files**, drag in the files **and folders**, then **Commit changes**. Ensure `index.html` and `README.md` are at the top level of the repository.
3. Open the repository **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**. Choose branch **main** and folder **/(root)**, then click **Save**.
4. GitHub will show the public website address in the Pages settings after deployment. Open it and test **Open .data** with a **backup** codeplug. Add the resulting URL to the “Try it online” line near the top of this README.
5. To publish a new version, replace the root `index.html` with the updated standalone HTML and commit it.

GitHub Pages hosts the **interface**; processing remains in the user's browser. No database, server-side service, API key, or paid hosting is required. If Pages settings are unavailable, verify repository visibility and the account/org Pages permissions.

## Developers

- The **root `index.html` is the distributable app**, with its JavaScript embedded. It runs without a build step and is what GitHub Pages serves.
- `src/` contains the original development source (`index.html` and JavaScript modules). `docs/` contains reverse-engineering and format notes. `tests/` contains Node.js tests.
- To try the split source locally, serve the repository root with `python -m http.server 8000`, then visit `http://localhost:8000/src/` (or open `src/index.html` directly); no npm packages are required for the JS tests.
- The JavaScript source in `src/` is provided for studying and contributing. **The distributable root HTML is the authoritative v6 release**; when making changes, update/regenerate that file as well, rather than assuming `src/index.html` is itself the published site.
- Run tests from the repo root (requires Node.js):

```sh
# Set the path to a private, locally stored compatible CPS .data fixture:
export DM32_TEST_CODEPLUG=/path/to/your-backup.data  # macOS/Linux
# PowerShell: $env:DM32_TEST_CODEPLUG='C:\path\to\backup.data'
node tests/tests.js
node tests/csv-tests.js
node tests/delete-tests.js
node tests/scan-index-tests.js
node tests/bulk-tests.js
node tests/extras-tests.js
node tests/extras-csv-tests.js
```

Tests need a **private local copy** of a compatible sample because no radio configuration data is distributed in this repository. You can also pass the `.data` path as the first argument to an individual test. The tests exercise parsing and editing logic, but do **not** replace verification in official CPS.

## Contributing and issues

Found a bug? Open a GitHub **Issue**. Please describe the firmware marker, the exact editing steps, expected versus actual behavior, and whether CPS accepted the exported file. **Do not attach codeplugs containing private IDs, contacts, or locations.** Redact any screenshots containing sensitive information.

Pull requests are welcome, particularly when supported by CPS before/after comparisons and tests. Unknown bytes should be preserved rather than guessed.

## License

[MIT License](LICENSE). If you are publishing a fork, replace the generic contributors copyright line with the correct rights-holder details when appropriate.
