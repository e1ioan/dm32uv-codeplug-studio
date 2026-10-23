# DM-32UV OEM CPS middle-deletion findings (October 23, 2026)

Comparison: supplied `DMR-10-22-26-new.data` (before) and `DMR-10-22-26-delete.data` (after). The user deleted entry **#2 in each of three tables**, using Baofeng's own CPS. Both images are 659,456 bytes, firmware family `DM32.NRF.01.049`. The OEM post-edit image differs from the original in **2,488 bytes**, spread over **six** 4096-byte pages only:

| File page start | Logical ID | Purpose |
| --- | --- | --- |
| `0x08000` | `0x11` | Scan lists |
| `0x0F000` | `0x42` | Per-channel DMR TX-contact selector |
| `0x11000` | `0x5C` | Zones and zone-selection header |
| `0x21000` | `0x12` | First channel page (84 records) |
| `0x22000` | `0x13` | Second channel page (85 records) |
| `0x23000` | `0x14` | Third channel page |

Counts go from 216→215 channels, 26→25 zones, 28→27 scans. The original reference handoff stated 27 scan lists; the actual before image has 28.

## How CPS compacted records

- The channel table is an **ordered positional array** of 48-byte records. After deleting #2, channel #2 is the former #3, #84 is the former #85 (crossing the first-page/header boundary), and #215 is the former #216. Count is a u16 little-endian at logical block `0x12` offset 0.
- Zone records are 145 bytes each, with a 16-byte name followed by the channel count and 64 u16 channel IDs. Zone #2 becomes the former #3, and so on. Count is the first byte of block `0x5C`.
- Scan-list records are 57 bytes each; scan #2 becomes the former #3, and so on. Count is the first byte of block `0x11`.
- Channel membership references in zones and scan lists generally change by `id > 2 ? id-1 : id`, with the deleted ID 2 removed. The OEM scan list formerly `EU-PMR1-8` is an exception: it keeps **eight** channel numbers `1..8` after deletion, rather than removing deleted #2 and leaving the seven survivors `1..7`. This is an observed CPS quirk, not a property to imitate.
- Block `0x42` at file offset `0x0F000` uses one 2-byte channel-associated DMR TX selector per channel. Its entries shift with the channels; the OEM final/unused slot retains a nonzero residual byte. The editor shifts all two-byte selectors and clears the unused one.
- The original zone block header byte at `0x11001` changed 7→1. This appears tied to OEM CPS's currently selected zone on save rather than evidence that a deletion must always reset to 1. The editor adjusts the selection's index if necessary.
- The channel Scan List ID is a numeric pointer in byte `+0x19`, now decoded as its **low six bits** (`& 0x3F`), per the more recent Chicago-Offline/NeonPlug correction. Deleting scan #N sets any channel selecting #N to None (`0`) and decrements every larger selection, preserving Auto Scan/bandwidth bits. In **both supplied OEM fixtures, all channel scan IDs are zero**, so this remapping has synthetic regression coverage but has not been directly confirmed against a CPS file with nonzero channel assignments.

## Why our image is not byte-for-byte identical to CPS

The after image retains **stale padding and opaque bytes** from the previous destination record. For instance, channel #2's old name `PMR-02` had a leftover character after CPS renamed the slot to `PMR-03`; the channel's decoded name is correct despite the trailing garbage. Several zone/scan names show the same phenomenon. Scan options at offsets `+0x0F`, `+0x11`, `+0x13` also occasionally remain associated with the old destination scan instead of with the moved scan. Treating CPS's residual bytes as a canonical format would propagate those inconsistencies.

The editor instead **moves complete surviving records**, including opaque fields and DMR data, and then consistently remaps the documented channel references. It clears the final free slot so it can be reused for an addition. This produces **229 differing bytes** compared with the OEM image, all in those six changed pages, while matching:

- all **215** surviving channels' decoded names, frequencies, modes, power, tones, and exposed settings;
- all **25** surviving zones' names and member arrays exactly;
- all **27** scan names and **26/27** scan membership arrays;
- the identified 2-byte-per-channel DMR contact-selector shifts.

This verifies the main positional structure, not manufacturer acceptance of arbitrary output. **Reopen generated codeplugs in Baofeng CPS and compare exported CSVs before writing to radio.** Further CPS experiments with active priority scan settings and nonzero channel scan indices would strengthen validation.
