import webbrowser
import threading
import time
import uvicorn


def open_browser():
    time.sleep(2)
    webbrowser.open("http://127.0.0.1:8000/docs")


threading.Thread(target=open_browser, daemon=True).start()

uvicorn.run(
    "app.main:app",
    host="127.0.0.1",
    port=8000,
    reload=True
)
