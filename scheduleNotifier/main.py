import requests
import time
import random
from datetime import datetime
from bs4 import BeautifulSoup
import subprocess
from requests.exceptions import ReadTimeout, ConnectionError


LOGIN_URL = "https://student.must.edu.mn/Login"
SELECTION_URL = "https://student.must.edu.mn/Course/SelectionSchedule"

STUDENT_ID = "B241870007"
PASSWORD = "Must_581"

REQ_TIMEOUT = (5, 10)          # (connect, read)
POLL_DELAY = (10, 20)        # seconds


def notify(msg: str):
    subprocess.run(
        ["curl", "-s", "-d", msg, "https://ntfy.sh/selection_notify"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def is_session_expired(resp: requests.Response) -> bool:
    if resp.url.endswith("/Login"):
        return True
    soup = BeautifulSoup(resp.text, "html.parser")
    return soup.find("input", {"name": "__RequestVerificationToken"}) is not None


def login(session: requests.Session):
    resp = session.get(LOGIN_URL, timeout=REQ_TIMEOUT)
    soup = BeautifulSoup(resp.text, "html.parser")

    token_input = soup.find("input", {"name": "__RequestVerificationToken"})
    if not token_input:
        raise RuntimeError("CSRF token not found")

    payload = {
        "returnUrl": "/",
        "username": STUDENT_ID,
        "password": PASSWORD,
        "__RequestVerificationToken": token_input["value"],
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://student.must.edu.mn",
        "Referer": LOGIN_URL,
    }

    post = session.post(
        LOGIN_URL,
        data=payload,
        headers=headers,
        allow_redirects=True,
        timeout=REQ_TIMEOUT,
    )

    if post.url.endswith("/Login"):
        raise RuntimeError("Login failed")


def main():
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.5",
        "Connection": "keep-alive",
    })

    while True:
        try:
            resp = session.get(SELECTION_URL, timeout=REQ_TIMEOUT)

            if is_session_expired(resp):
                login(session)
                resp = session.get(SELECTION_URL, timeout=REQ_TIMEOUT)

        except ReadTimeout:
            print("timeout:", datetime.now())
            time.sleep(30)
            continue

        except ConnectionError:
            print("connection error:", datetime.now())
            time.sleep(60)
            continue

        soup = BeautifulSoup(resp.text, "html.parser")
        h4 = soup.find("h4", class_="card-title")

        if not h4:
            print("status element missing")
            time.sleep(60)
            continue

        status_text = h4.get_text(strip=True)

        if status_text == "Одоогоор хуваарь сонголт идэвхгүй байна.":
            print("running:", datetime.now())
        else:
            alert = "ITS ON! ITS ON! ITS ON!"
            while True:
                notify(alert)
                print(alert)
                time.sleep(2)

        time.sleep(round(random.uniform(*POLL_DELAY), 2))


if __name__ == "__main__":
    main()

