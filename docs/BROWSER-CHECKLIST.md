# NovaPay Browser Checklist

Use the fixed named owner test account and the local server (`npm start`). Do not create a PayPal order.

| # | Exact steps | PASS/FAIL | Notes |
|---:|---|---|---|
| 1 | Open `http://localhost:3000/preview.html`; click **Log in**; sign in as the fixed owner; click **Dashboard** (or open `http://localhost:3000/dashboard.html`). |  |  |
| 2 | Open DevTools (**View → Developer → JavaScript Console**); select **Network**, enable **Preserve log**, filter `events`; reload the dashboard. Confirm `GET /api/events` is not 503 and there is no matching console/network error. |  |  |
| 3 | In dashboard navigation click **AI Assistant**; click the question field, type `What is 7 + 5?`, click **Send**. Confirm the answer shows **Route · code**; hover the badge and confirm its reason is `deterministic_arithmetic`. |  |  |
| 4 | Click **Fundraising**, then **Maintenance**, then **Transparency** in the dashboard navigation. Confirm each view loads without console or failed-network errors. |  |  |
| 5 | Click **Switch theme** to dark; confirm dark appearance. Click it again to return to light. |  |  |
| 6 | Narrow the browser to a mobile width; click the menu/drawer button to open navigation, select **Fundraising**, then reopen and close the drawer. |  |  |
| 7 | Restore desktop width; click the **View notifications** bell. Confirm the notification panel opens and loads without console/network errors. |  |  |
