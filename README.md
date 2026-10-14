# Gradebook — Student Grade Management System

A responsive university grade dashboard with a **C++17 fixed-size array** at its core. C++ owns student storage, validation, CRUD operations, search, stable sorting, grades and statistics. Emscripten/Embind exposes the engine to a vanilla HTML/CSS/JavaScript frontend. The deployment target is a static `dist/` folder suitable for GitHub Pages.

**Current verification:** `dist/` contains the generated Emscripten loader and WebAssembly binary. Native C++ tests, JSON integration, CTest, real WebAssembly integration, JavaScript syntax/static checks, and HTTP repository-subpath loading checks pass. The user reports a successful Emscripten 6.0.12 build and local browser operation. A manual GitHub Pages workflow is prepared but has not been run; nothing has been pushed, published, or deployed. See [VERIFICATION.md](VERIFICATION.md) for evidence and remaining checks.

## Features

- Add, edit and delete students; editable unique IDs, full names and decimal examination scores.
- Automatic A/B/C/D/F grades and pass/fail, calculated in C++.
- Class average, highest and lowest scores, pass rate and grade distribution.
- Case-insensitive ASCII ID/name search; pass/fail filtering; name/score sorting in both directions.
- Paginated table, responsive navigation, accessible labels, native modal dialogs and keyboard focus handling.
- Local persistence and atomic restoration with C++ validation for every saved record.
- Invalid-data recovery download, explicit discard confirmation, storage-failure warnings, and concurrent-tab change detection.
- Optional fictional sample class and JSON backup export. A new class starts empty.
- No runtime CDN, UI framework, database, external font or server dependency.

## Project layout

```text
include/grade_engine.hpp       Student struct, fixed array and public API
src/grade_engine.cpp           Array algorithms, validation, grading, statistics, JSON
src/bindings.cpp               Embind class and operation-result bindings
web/                          Editable HTML, CSS, JavaScript and favicon
tests/grade_engine_test.cpp    Native C++ tests (including capacity and boundaries)
tests/native-json.test.mjs     Parses real native C++ JSON in Node
tests/wasm.test.mjs            Actual WebAssembly/Embind and persistence integration
tests/static.test.mjs          UI references and source/dist synchronization
tests/pages.test.mjs           Distribution and HTTP repository-subpath Wasm checks
.github/workflows/pages.yml    Manual build, test, and GitHub Pages deployment
scripts/build.ps1             Compile WebAssembly and assemble dist
scripts/test.ps1              Compile/run native tests; run JSON test if Node exists
scripts/serve.mjs              Dependency-free local HTTP preview
CMakeLists.txt                Alternative native and Emscripten build targets
dist/                         Static frontend plus compiled wasm artifacts when built
build/                        Ignored native binaries and intermediate artifacts
```

## Architecture and array operations

```text
User interaction → JavaScript UI → Embind → C++ GradeEngine
                                              │
                                    Student students_[1000]
                                    count_ = active prefix length
                                              │
                          C++ JSON snapshot with derived values
                                              ↓
                              DOM rendering / localStorage
```

`Student` contains `std::string id`, `std::string name`, and `double score`. The sole authoritative student store is the built-in array `Student students_[CAPACITY]`, where `CAPACITY` is exactly 1,000. There are no `std::vector`, `std::map`, dynamically resized student containers, or databases. `std::string` holds text inside each struct; it is not a student collection.

| Operation | Implementation | Time |
| --- | --- | --- |
| Insert | Validate, linear duplicate lookup, append at `count_` | O(n), O(1) append |
| Delete | Linear lookup; shift following records left; clear vacated slot | O(n) |
| Update | Linear lookup and duplicate check; replace one struct | O(n) |
| Search/filter | Traverse active prefix; match ID/name substring and result | O(n) for bounded text |
| Sort | Stable insertion sort directly in the array | O(n²) worst case, O(n) best case |
| Statistics | One traversal; accumulate extrema, sum, pass count and buckets | O(n) |
| Export/traversal | Serialize the active array in order | O(n) for bounded text |

Sorting uses a single temporary Student, not a second student collection. Array operations use O(1) additional record space. JSON output uses space proportional to the output. Sorting equal names/scores preserves their previous order. Name comparison/search folds ASCII letters; non-ASCII names are preserved but do not receive locale-aware case folding or collation.

JavaScript parses the JSON for rendering, formats numbers, handles page boundaries, and transports records to/from localStorage. **It never calculates grades, pass/fail, score aggregates or distribution percentages.** `snapshotJson(query, status)` performs filtering and traversal in C++, returning students and full-class statistics. Table filtering does not change the class-wide metric cards or chart.

The Embind API exposes `new Module.GradeEngine()`, `add`, `update`, `remove`, `sort`, `snapshotJson`, and `exportJson`. Mutations return `{ ok, message }`. Native `at()` bounds-checks and returns `nullptr` for an invalid index. Embind engine objects are explicitly released with `.delete()` when replaced.

## Grading and validation

| Grade | Original score | Result |
| --- | --- | --- |
| A | 80–100 | Pass |
| B | 70 ≤ score < 80 | Pass |
| C | 60 ≤ score < 70 | Pass |
| D | 50 ≤ score < 60 | Pass |
| F | 0 ≤ score < 50 | Fail |

This is a documented assignment policy, not an assertion about a particular university's grading scheme. To change it, edit `PASS_MARK`, `letterGrade()` and the corresponding UI guide/tests together.

- Scores must be finite doubles in [0, 100]; NaN and infinities are rejected. Decimal scores are supported. Grades use the original score, not rounded display values.
- IDs are trimmed and normalized to uppercase; 1–24 ASCII letters, digits, `_` or `-`. Duplicate IDs are rejected case-insensitively on both insertion and update.
- Names are trimmed, required, limited to 120 UTF-8 bytes, and cannot contain ASCII control characters. Unicode names are supported; the browser's length hint is supplemented by C++ byte validation.
- The 1,001st insertion fails without changing the array. Edits and deletions still work at capacity.
- Empty C++ statistics are zero; the UI displays a dash where no score or rate is meaningful.
- Failed validation leaves existing records unchanged.

## Prerequisites

- Native testing: a C++17 compiler. `scripts/test.ps1` accepts `g++` or `clang++`; CMake also supports MSVC.
- WebAssembly: the official [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html), activated in your current shell.
- Local preview and JS/Wasm integration testing: Node.js 20+.
- Windows PowerShell 5.1+ or PowerShell 7 for the supplied scripts.

No `npm install` is needed: there are no JavaScript package dependencies.

### Install Emscripten inside this project

The SDK is a development tool and is intentionally ignored by Git. Run these commands **only when you want to download/install it**:

```powershell
New-Item -ItemType Directory -Path .tools -Force
git clone https://github.com/emscripten-core/emsdk.git .tools/emsdk
& ./.tools/emsdk/emsdk.bat install latest
& ./.tools/emsdk/emsdk.bat activate latest
# Import emsdk's environment into this PowerShell session:
./.tools/emsdk/emsdk_env.ps1
em++ --version
```

If your SDK release only provides `emsdk_env.bat`, open a command prompt, call that batch file, and launch PowerShell from that prompt so it inherits the activated environment. Re-activate the shell environment in new terminal sessions. SDK downloads need network access and sufficient disk space. The SDK supplies its supported toolchain dependencies; a missing standalone Python on PATH is not needed for this project's native tests or Node preview.

### Build and run on Windows

```powershell
# Run from the project root in an Emscripten-enabled shell.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
node tests/wasm.test.mjs
node scripts/serve.mjs
```

Open **http://127.0.0.1:4173**. Stop the preview with Ctrl+C. Set `$env:PORT = '8080'` to use another port. Use HTTP rather than opening `index.html` with `file://`; ES modules and WebAssembly loading depend on the browser's origin rules.

Convenience aliases: `npm test`, `npm run build`, `npm run test:wasm`, `npm run test:static`, `npm run test:pages`, `npm run check`, `npm start`. On PowerShell installations where the `npm.ps1` shim is restricted, use `npm.cmd` or the direct commands above.

`scripts/build.ps1 -StaticOnly` copies the frontend without compiling. Its success **does not mean the app is ready to manage students**. The full build returns a failure if `em++` is unavailable, compilation fails, or either output artifact is missing/empty.

### Native CMake alternative

```powershell
cmake -S . -B build/cmake -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release
cmake --build build/cmake
ctest --test-dir build/cmake --output-on-failure
```

For Visual Studio/MSVC, omit `-G "MinGW Makefiles"`, then build with `--config Release` and test with `-C Release`. On macOS/Linux, use your usual native generator and `ctest`.

### WebAssembly CMake alternative

In an activated Emscripten environment:

```text
emcmake cmake -S . -B build/emscripten -DCMAKE_BUILD_TYPE=Release
cmake --build build/emscripten
```

Then copy `web/` contents into `dist/`, copy `build/emscripten/grade_engine.mjs` and `.wasm` into `dist/wasm/`, and add an empty `dist/.nojekyll`. The PowerShell build performs this packaging automatically. The module uses [Embind](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html) and [modularized ES module output](https://emscripten.org/docs/compiling/Modularized-Output.html), with no filesystem, no main entry point, and no cross-origin isolation or threading requirements.

## Persistence and backups

`localStorage['gradebook.students.v1']` holds only raw student fields in this versioned envelope:

```json
{"version":1,"students":[{"id":"STU-001","name":"Ama Mensah","score":92}]}
```

On refresh, JavaScript checks the envelope and field types, then passes every student through `GradeEngine::add()` in a temporary C++ engine. Only a completely valid snapshot replaces the active engine. Invalid JSON, versions, duplicates, invalid scores and capacity overflow preserve the original saved data and disable editing until explicit recovery/discard.

Storage access or quota failures leave records available in memory and show a persistent warning. Export the backup before leaving. Clearing browser data, switching browsers, using private browsing, or changing the site's origin can make local records unavailable. This is a local assignment application, not a multi-user university records service.

**Browser localStorage is device- and browser-profile-specific.** Records do not sync between devices, browsers, or users, and are not uploaded to GitHub Pages. Storage is scoped to the site's origin (scheme, host, and port), so records saved on localhost do not automatically appear on the deployed HTTPS site. Repository paths on the same `username.github.io` origin share localStorage; another copy using the same `gradebook.students.v1` key will share those records. Export a backup before moving to a different device or origin.

The **Export backup** button downloads all raw records from the C++ engine, regardless of table filters. A recovery backup can be reviewed and restored by placing its valid envelope under the storage key using browser developer tools, then reloading. There is no file-import UI. When another tab changes the storage key, this tab stops editing and requests a reload instead of silently overwriting those changes.

## Testing

Native tests cover empty arrays, input normalization, duplicates, invalid names/IDs, zero/100/decimal/non-finite scores, update atomicity, first/middle/last deletion and shifting, deleted-slot reuse, all grade boundaries, statistics, search/filtering, stable name/score sorting in both directions, a full 1,000-record array, overflow rejection and escaped Unicode JSON. The Node JSON test consumes output from the compiled C++ executable.

`node tests/wasm.test.mjs` requires the actual compiled module. It checks Embind mutation results, statistics, filtering, serialization, persistence round-trip and corrupt-data rejection. It exits nonzero with a clear blocker if the module is absent; it does not substitute a mock engine.

`npm run test:pages` verifies the complete distribution, relative asset references, and real Wasm loading over HTTP under `/student-grade-system/`. It evaluates the generated loader's browser branch without Node globals and checks C++ grades and statistics. It uses Node's experimental VM modules (an expected warning); this is an HTTP/runtime integration test, not a substitute for browser UI testing.

Before submission, run these browser checks at desktop and mobile widths:

1. Add, edit and delete students; cancel a deletion; try duplicate IDs and invalid scores.
2. Try the sample class on an empty dataset. Check search, pass/fail filters, sorting, both table pages, metrics and chart.
3. Refresh and verify all valid records return. Export a backup and inspect its raw fields.
4. Verify keyboard access, dialog Escape/cancel, narrow-screen scrolling and empty search results.
5. Using disposable test data, try an invalid stored snapshot, unavailable storage and a change from a second tab; verify the warning/recovery paths.

See [VERIFICATION.md](VERIFICATION.md) for checks performed in the provided environment and remaining verification limits.

## GitHub Pages deployment (not performed)

After a successful build and Wasm integration test, `dist/` must contain:

```text
dist/
  .nojekyll
  index.html
  styles.css
  app.js
  persistence.js
  favicon.svg
  wasm/
    grade_engine.mjs
    grade_engine.wasm
```

All asset paths are relative, so a project URL such as `https://username.github.io/student-grade-system/` works. There are no backend endpoints or SPA history routes. Keep the `.mjs` and `.wasm` files together; the generated module resolves its wasm beside itself.

The workflow at [`.github/workflows/pages.yml`](.github/workflows/pages.yml) is **manual only** (`workflow_dispatch`); pushing changes does not publish the site. It uses an Ubuntu runner, Node.js 24, and Emscripten **6.0.12** installed from the official emsdk repository. PowerShell 7 on the runner executes the existing `scripts/test.ps1` and `scripts/build.ps1`; the Windows `npm run build` alias is not used in CI. The workflow runs native, JSON, CMake/CTest, syntax, static, Wasm, and repository-subpath checks before uploading **only `dist/`**. A separate deployment job requires the successful build and publishes that artifact to the `github-pages` environment.

When you are ready to publish:

1. Commit and push the existing source, scripts, tests, `package.json`, and workflow to the repository's default branch. This step has not been performed here. The workflow builds fresh artifacts and does not rely on a checked-in SDK or local `build/` files.
2. In the repository, open **Settings → Pages → Build and deployment**, and select **GitHub Actions** as the source. Ensure Actions are enabled and the `github-pages` environment allows deployments from your chosen branch.
3. Open **Actions → Deploy Gradebook to GitHub Pages → Run workflow** and select the default branch. This manual action builds, tests, and deploys the application.
4. Open the URL shown by the deployment job, normally `https://USERNAME.github.io/REPOSITORY/`. Check that the loader and Wasm requests succeed, add a disposable test record, refresh, and verify that it is restored.

No personal access token or backend credentials are needed. The workflow uses GitHub's token with read access for the build and `pages: write` / `id-token: write` for deployment, following [GitHub's custom Pages workflow instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). SDK installation follows the [official Emscripten instructions](https://emscripten.org/docs/getting_started/downloads.html).

The published site needs only static HTTP hosting with JavaScript and `application/wasm` MIME types. Node.js, PowerShell, C++, Emscripten, and `scripts/serve.mjs` are development/build tools, not runtime dependencies. The generated loader contains a Node-specific branch for local integration tests; browsers take its browser branch and fetch the Wasm file relative to the loader. No localhost URL, API service, or development-only file is required by the site.

The workflow and hosted URL still need their first GitHub run and browser verification. No publishing settings have been changed and no deployment has been triggered.
