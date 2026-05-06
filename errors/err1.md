 Required System Updates for BiteSpeed
1. User ID Generation & Dataset Update
Existing dataset does NOT contain user_id → must be added.
AI should:
Create new column: user_id
Assign IDs like: user1, user2, ..., user500
Total users = 500 students
Out of them:
200 = regular users (high frequency orders)
300 = occasional users (low frequency)
Distribution must be realistic based on dataset patterns (not purely random uniform)
AI must:
Analyze dataset ordering frequency
Assign frequent orders → same 200 users repeatedly
Assign sparse orders → remaining users
Also generate/update a separate CSV:
users.csv
Fields:
user_id
user_type → (regular / occasional)
2. Training Logic Update (Prebooking vs Dine-in)
Dataset now has:
is_prebooking
prebooking_datetime
order_timestamp
Model training must follow:
IF is_prebooking == true → use prebooking_datetime
ELSE → use order_timestamp
This logic must be applied consistently in:
Feature engineering
Training (xgb.py)
Prediction (get_predictions.py)
3. Admin Panel Restructure (Tabs)
Update Admin UI:
Merge these tabs:
Frozen Users
Blocked Users
User Maintain
New Users
 into ONE tab: User Maintenance
Final Admin Tabs:
Demand Analysis (DEFAULT TAB)
User Maintenance
Environment Variables
4. Demand Prediction UI Improvements
Must support:
Hour-based predictions (like real canteen management)
Graph requirements:
Clean, modern UI (chart library allowed)
Hover tooltip → shows exact values (NO bugs)
Click on any hour → open graph
Multiple hour graphs can be opened simultaneously
Ensure:
Smooth rendering
No UI freezing
Accurate mapping of prediction data
5. Orders Management System (NEW TAB)
Add new Admin tab: Orders Management
Features:
Show today’s orders only
Source: data1.csv
Display:
Time-wise sorted orders
Auto sorting logic:
Prebooking → sort by prebooking_datetime
Dine-in → sort by order_timestamp (FIFO)
For each order:
Button:
Delivered
Not Delivered
When new order is added:
List auto reorders correctly
6. Environment Variables Tab
Move all environmental controls to:
 Environment Variables tab
Keep it separate from Demand Analysis
7. Canteen Timing Update
Change timings:
OLD: ~8 AM – 8 PM
NEW: 8 AM – 6 PM
Apply this constraint to:
Ordering system
Prebooking logic
Prebooking must:
Only allow time slots within 8 AM – 6 PM
8.If any error comes currently it shows Contact AI if this continues.It shud show contact admin if this continues.

 Important Constraints
All features shud be properly working without nay kind of bug.
Maintain ML-ready CSV format
UI must remain responsive (no freezing issues)