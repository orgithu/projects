import requests
import time
import random
from bs4 import BeautifulSoup

LOGIN_URL = "https://student.must.edu.mn/Login"
SELECTION_URL = "https://student.must.edu.mn/Course/SelectionSchedule"

STUDENT_ID = "student_id" #ex: b241869996
PASSWORD = "password" #your_mom

def notify(msg: str, priority):
    requests.post(
        "https://ntfy.sh/topic_word", #change with your topic word
        data=msg.encode("utf-8"),
        headers={
            "Priority": str(priority)
        }
    )

def is_session_expired(resp: requests.Response) -> bool:
    if resp.url.endswith("/Login"):
        return True
    soup = BeautifulSoup(resp.text, "html.parser")
    return soup.find("input", {"name": "__RequestVerificationToken"}) is not None

def login(session: requests.Session):
    resp = session.get(LOGIN_URL)
    soup = BeautifulSoup(resp.text, "html.parser")
    token_input = soup.find("input", {"name": "__RequestVerificationToken"})
    if not token_input:
        raise RuntimeError("CSRF token not found")
    token = token_input.get("value")
    payload = {
        "returnUrl": "/",
        "username": STUDENT_ID,
        "password": PASSWORD,
        "__RequestVerificationToken": token
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://student.must.edu.mn",
        "Referer": LOGIN_URL
    }
    session.post(LOGIN_URL, data=payload, headers=headers, allow_redirects=True)

def main():
    session = requests.Session()
    while True:
        selection_resp = session.get(SELECTION_URL)
        if is_session_expired(selection_resp):
            login(session)
            selection_resp = session.get(SELECTION_URL)
        with open("test.html", "w", encoding="utf-8") as f:
            f.write(selection_resp.text)
        soup = BeautifulSoup(selection_resp.text, "html.parser")
        h4 = soup.find("h4", class_="card-title")
        if not h4:
            raise RuntimeError("Status message not found")
        status_text = h4.get_text(strip=True)
        if status_text == "Одоогоор хуваарь сонголт идэвхгүй байна.":
            print("not yet:(")
            notify("not yet:(",1)
        else:
            alertMsg = "ITS ON! ITS ON! ITS ON! ITS ON!"
            while True:
                notify(alertMsg,5)
                print(alertMsg)
                time.sleep(1)
        time.sleep(round(random.uniform(4, 6), 2))
        
if __name__ == "__main__":
    main()
