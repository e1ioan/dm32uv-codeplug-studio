# Contributing

Thank you for improving DM-32UV Codeplug Studio.

1. Open an Issue describing the problem or intended feature.
2. Explain the `.data` firmware marker and provide **redacted**, reproducible steps. Please do not publish personal codeplugs.
3. Preserve unknown/undocumented bytes. Do not assume unused-looking data is safe to overwrite.
4. Add tests for any newly mapped field or record-index operation.
5. Test an unmodified load/save roundtrip (byte-identical) and a narrowly edited file. Verify edited files using official CPS where possible.
6. Keep root `index.html` synchronized with source changes; this is the public GitHub Pages build.

This is not an official Baofeng product. Never claim speculative format fields are confirmed.
