# "I updated the files but the UI did not change"

The app is two programs: the **frontend** (what you see) and the **backend** (data). Docker builds each into an *image*.
A new zip changes only the files on disk. The running containers keep using the **old image** until you rebuild.

## How to see which version you are running
* Look at the **bottom of the sidebar**. It must say `TRUSTSHARE v3.0.0 · AURORA`. Anything else (or nothing) = old frontend.
* A **red banner** at the top of the page says "Old backend detected" when the frontend is new but the backend container is old.
* Open http://localhost:8000/ in the browser. It must show `"version":"3.0.0"`.

## The usual causes (in order of how often they happen)
| Cause | Fix |
|---|---|
| You are inside the **old folder** in VS Code and only some files were copied from the zip | Unzip the zip into a **new** folder, copy your `.env` into it, open THAT folder |
| `docker compose up` was run **without `--build`** | Use the script below (it always rebuilds) |
| Docker re-used cached layers | `docker compose build --no-cache` (the script does it) |
| Two copies are running: Docker on **3000** and `npm run dev` on **5173** | Use only one. For this project use Docker (http://localhost:3000). Stop `npm run dev` |
| The browser cached the old files | `Ctrl + Shift + R` |
| An old container still holds port 8000 or 3000 | `docker ps`, then `docker compose down` in the OLD folder |

## One command that does everything right
In the VS Code terminal, inside the new folder:
```powershell
powershell -ExecutionPolicy Bypass -File .\update.ps1
```
It checks you are in the new folder, stops old containers (data kept), rebuilds with no cache, starts, waits for the backend,
compares its version with the files, and opens the browser. If the versions differ it tells you.

## "npm error ERESOLVE ... vite@8" while building
`frontend/package.json` in your folder asks for `vite ^8`, but the React plugin supports vite 4 to 7 only. Fix (PowerShell):
```powershell
cd frontend
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install --save-dev vite@5.4.11 @vitejs/plugin-react@4.3.4
cd ..
```
`update.ps1` now repairs this automatically and stops if the Docker build fails (a failed build used to be followed by starting the OLD images, which is what shows the red "Old backend detected" banner).
