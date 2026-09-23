# Agentation

`src/targets.ts` adapts the native visibility check from Agentation's `package/src/utils/hit-testing.ts`. It checks opacity and CSS visibility before selecting or positioning a target. Our implementation also excludes content inside closed disclosures, resolves unique selectors within the host root, and measures targets again after layout changes. It does not recover targets from saved screen coordinates.

Source: https://github.com/benjitaylor/agentation/blob/0e3236eb1a0f5577852ab7bb5121f5dd46d42f1d/package/src/utils/hit-testing.ts

Copyright (c) 2026 Benji Taylor

The adapted code is subject to the PolyForm Shield License 1.0.0 below. This license restricts competing products and services. It is not an MIT license.

## License

PolyForm Shield License 1.0.0

Copyright (c) 2026 Benji Taylor

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to use,
copy, modify, and distribute the Software, subject to the following conditions:

1. You may not use the Software to provide a product or service that competes
   with the Software or any product or service offered by the Licensor that
   includes the Software.

2. You may not remove or obscure any licensing, copyright, or other notices
   included in the Software.

3. If you distribute the Software or any derivative works, you must include a
   copy of this license.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

For more information, see https://polyformproject.org/licenses/shield/1.0.0
