Dataset 
dont show the orders where quantity is 0 in the user history of booking and also in the management,admin orders history.just that it shudnt be displayed anywhere. but in the data1.csv it should be there for the ML prediction

Order API Error (Dine-in Logic)
Issue:
POST /api/order → 500 error still occurs
Possible cause:
Canteen timing restriction applied incorrectly
Fix:
Apply timing restriction only for prebooking
Dine-in orders:
Must be allowed any time (no restriction)
Ensure:
Backend does not reject dine-in due to timing

Management Orders UI Interaction
In Order Management tab:
Required behavior:
Orders displayed as selectable rows/cards
Add a movable selection box:
User can move:
Down → next order
Up → previous order
Controls:
Arrow Down → move selection down
Arrow Up → move selection up
Enter or Space → toggle:
Delivered ↔ Pending

Management Permissions Update
In Management panel:
Remove:
“Remove order” option
Only allow:
Delivered / Pending toggle
