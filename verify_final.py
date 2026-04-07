from playwright.sync_api import sync_playwright
import json
import time

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Mock session
        session_data = {
            "state": {
                "authUser": {
                    "id": 1,
                    "username": "admin",
                    "role": "Admin",
                    "full_name": "Administrator"
                },
                "isAuthenticated": True,
                "sidebarCollapsed": False,
                "lastSync": None
            },
            "version": 0
        }

        page.add_init_script(f"window.localStorage.setItem('medicore-store', '{json.dumps(session_data)}');")

        print("Navigating to Support Center directly...")
        page.goto("http://localhost:3000/support/")
        time.sleep(10)
        page.screenshot(path="verification_results/support_final.png", full_page=True)

        print("Navigating to Messages...")
        page.goto("http://localhost:3000/messages/")
        time.sleep(5)
        page.screenshot(path="verification_results/messages_final.png", full_page=True)

        print("Navigating to Billing...")
        page.goto("http://localhost:3000/billing/")
        time.sleep(5)
        page.screenshot(path="verification_results/billing_final.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    run_verification()
