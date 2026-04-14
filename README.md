# BiteSpeed - ML Data Collection App

This is a local food ordering app built exclusively to quickly take inputs (Dine-in or Prebook) and silently dump strictly formatted ML data instantly into `data1.csv`.

## Project Structure
- **/backend**: A tiny Node.js + Express API server. It receives the order arrays and securely appends lines into `data1.csv`.
- **/frontend**: A React + Vite Web App styled with Tailwind CSS, packaged internally using Capacitor so it behaves like a native Android app.
- **`data1.csv`**: The master database flat-file. The backend will automatically create this if it's missing.

---

## 🛠️ Phase 1: Running the Backend (The Brain)

**You MUST start the backend on your laptop before pushing buttons on your phone.**
1. Open a terminal and go into the backend folder:
   ```bash
   cd backend
   npm install
   node server.js
   ```
2. You will see `Server is running on port 5000`. Leave this terminal open in the background forever!

---

## 🌐 Phase 2: Running the Frontend on your Laptop (Testing)

If you just want to test if the buttons work and see if it drops orders into `data1.csv`:
1. Open a new terminal and go into the frontend folder:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Open `http://localhost:5173` in your laptop's browser. Place an order, and watch it show up in `data1.csv`!

---

## 📱 Phase 3: Building the APK for your Phone (Android Studio)

If you want to install this as a native app on your phone, you need Android Studio.

### The Big Problem: Windows Firewall!
Before you build the app, you MUST tell Windows to let your phone talk back to your laptop!
1. Hit the Windows Key, type **Windows Defender Firewall with Advanced Security**, and open it.
2. Click **Inbound Rules** (on the left) ➔ **New Rule...** (on the right).
3. Select **Port** ➔ **TCP**, type `5000` under specific local ports.
4. Select **Allow the connection**, keep hitting Next, name it "NodeJS API", and hit Finish.

*Also ensure your laptop's IP address inside `frontend/src/services/api.js` matches your laptop's current network IP! (You can find it by typing `ipconfig` in your terminal and looking for IPv4 Address).*

### Compiling the App
1. First, process the web code into Android files:
   ```bash
   cd frontend
   npm run build
   npx cap sync android
   ```
2. Open **Android Studio**.
3. Open the folder: `frontend/android` inside Android Studio.
4. Click **Build ➔ Build Bundle(s) / APK(s) ➔ Build APK(s)**.
5. Once finished, install that `.apk` onto your Android phone!
