# v6 additions — Baofeng DM-32UV `DM32.NRF.01.049`

Scope is restricted to the supplied 659456-byte CPS disk images. Everything is edited in memory; no radio connection.

## Key Settings

Logical ID `0x04` (global settings) relative offsets:

- `0x85` bits 0..2: auto/manual lock, knob lock, side-key lock (higher bits masked/preserved)
- `0x86`: auto-keypad-lock delay, 5–60 seconds
- `0x87..0x8A`: SK1 Short, SK1 Long, SK2 Short, SK2 Long
- `0x8D..0x90`: P1 Short, P1 Long, P2 Short, P2 Long
- `0x93`: long-press time, raw 0–4 / CPS displayed 1–5
- Function byte enum 0–42 follows `05-DATA-STRUCTURES.md`.

Keys in the example codeplug: SK1 Short=Scan (18), SK1 Long=Nuisance Channel Delete (29), SK2 Short=Monitor (25), SK2 Long=Power Select (1), P1 Short=Zone Down (17), P1 Long=FM Radio (22), P2 Short=Zone Up (16), P2 Long=V/M (7). Your screenshot shows these same settings, and long-press time 3. The file's current auto-lock delay is 5 seconds; the screenshot shows 10, which would be an edit.

## Talk Groups

The sample's talk-group physical block is logical ID `0x44` at `0x1C000`. Each record is 24 bytes (entry start = page+1+(n−1)*24). Name is at entry+1 (16 ASCII bytes), DMR ID is uint24 little endian at entry+18, call type at entry+21 (3=Private, 4=Group, 5=All).

The CPS disk file's **active** talk-group metadata/index table appears at **`0x1B000`**, despite its page-local byte `0xFFF` being **`0xFF`** (it cannot be found via logical ID `0x0B`). Its first five bytes are `04 00 04 00 00`, slot bitmask at +0x10, name-sorted index table at +0x100, numeric DMR-ID sorted index table at +0x740. The four entries referenced by the index are `TG226-RO`, `TG268-PT`, `TG9-LOCAL`, `TG99`. The physical talk-group block also retains `Contacts 5`..`Contacts 10` as inactive template records.

v6 edits existing groups in place; rebuilding the two known index tables follows source-researched sort order. Addition is limited to the six existing template slots (10 total, **not** claimed radio maximum). Deleting an active group compacts active slots, clears/adjusts known channel TX selectors in blocks 0x42/0x43, and removes its DMR ID from RX lists unless an active group shares that ID. This is reconstructed behavior, **not yet CPS-verified**, and it is not byte-identical to how CPS might implement additions/deletions.

## RX Group Lists

Logical ID `0x0F` at `0xB000`: first four bytes are active-slot bitmask (`0x07` in sample), first record starts +0x11, 109 bytes/record. Group name occupies 11 bytes; the editor allows 10 printable ASCII characters followed by terminator. Membership at entry+0x0B is up to 32 **DMR IDs** (uint24 little endian), not positional contact indices. Byte positions +0x6B and +0x6C remain unchanged. Adding/deleting groups updates the active slot bitmask and known channel RX-group index references. The original sample has 3 active groups (`PT-RX`, `RO-RX`, `DIRECT-RX`).

## Channel linkage

- DMR RX group index: channel record byte +0x1F, low 6 bits, 0=None.
- TX Talk Group selection: two-byte selector in logical block `0x42` or `0x43`, high nibble of first byte plus second byte. Low nibble is preserved on assignment.
- Scan lists: **15** stored member channels, with currently monitored channel handled outside this array (the user's observed 16th channel).

## Tests

- `node extras-tests.js`: 14 tests covering zero edit, key masks, group changes, reference updates, add/delete, rollback.
- `node extras-csv-tests.js`: CSV zero-edit roundtrip, edits and atomic rejection.
- `python test_browser_v6.py`: Chromium UI test, edited keys, Talk Group name, channel TX selector, RX membership, export/reopen.
- Previous `tests.js`, `csv-tests.js`, `delete-tests.js`, `scan-index-tests.js`, `bulk-tests.js` continue to pass.
- Untouched save matches each original supplied file byte-for-byte.

## Required verification

Use official Baofeng CPS matching radio and firmware before transmitting/programming edited codeplugs. Especially validate TG/RX group insertion/deletion and sorted index metadata. Never assume undocumented bytes are spare space. This editor handles no contacts database, VFO, radio ID slot editor, or general APRS/GPS configuration.

Sources: [DM32 data structures](https://github.com/infamy/DM32-Protocol-Spec/blob/main/05-DATA-STRUCTURES.md), [DM32 block inventory](https://github.com/infamy/DM32-Protocol-Spec/blob/main/07-BLOCK-INVENTORY.md), and the supplied `DM32UV_DATA_FORMAT_SEED.md` with actual binary comparison.
