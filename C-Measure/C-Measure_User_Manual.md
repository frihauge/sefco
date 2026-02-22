# C-Measure User Manual

**Version 1.0.0**
**Stretch Film Measure System**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Installation](#2-installation)
3. [Getting Started](#3-getting-started)
4. [Home Page](#4-home-page)
5. [Measurements](#5-measurements)
6. [Reports](#6-reports)
7. [Calibration](#7-calibration)
8. [Settings](#8-settings)
9. [Moving the System to Another PC](#9-moving-the-system-to-another-pc)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

C-Measure is a desktop application for measuring stretch film tension using Phidget load cell sensors. The system consists of 12 sensors (6 ports x 2 channels) mounted at heights from 15 cm to 180 cm, measuring force in Deka Newton (daN).

The application has a Python backend that communicates with the Phidget hardware and an Electron-based frontend for the user interface.

---

## 2. Installation

### Requirements
- Windows 10 or later
- Phidget22 drivers (the installer will prompt you to install these)
- Microsoft Visual C++ Redistributable 2015-2022 (required for the backend)

### Install Steps
1. Run the **C-Measure Setup** installer (.exe)
2. When prompted, install the **Phidget22 drivers** (required for sensor communication)
3. Choose the installation directory and complete the installation
4. Launch C-Measure from the Start Menu or desktop shortcut

### First Launch
On first launch, the application will:
- Start the backend server automatically
- Show the Home page with connection status
- Display a calibration warning if no calibration file is found

> **Important:** If you see a "Backend Error" on first launch, ensure that Visual C++ Redistributable is installed. Download it from [microsoft.com/download](https://www.microsoft.com/download).

---

## 3. Getting Started

### Connecting to the Sensor Hub
1. Ensure the Phidget VINT Hub is connected and powered on
2. The status bar at the bottom-left shows:
   - **C-Measure: active** — Hub is reachable
   - **C-Measure: offline** — Hub is not reachable
   - **C-Measure: simulation** — Running in simulation mode
3. If the hub is offline, click **Connect WiFi** on the Home page to configure the network connection
4. The connection status shows how many sensors are connected (e.g., "10/12 connected")

### Navigation
The sidebar on the left provides access to:
- **Home** — System overview and connection status
- **Measurements** — Live sensor readings and plot
- **Reports** — Compare saved measurements
- **Settings** — Application configuration

---

## 4. Home Page

The Home page displays:
- **Connection status** — Number of connected sensors
- **Hub status** — Whether the Phidget hub is reachable
- **System info** — System serial number, paired serial, and last calibration date
- **Last test** — Name of the most recently saved measurement
- **Data directory** — Where measurement and calibration files are stored

### Calibration Warning
If no calibration file is found for the current system serial, a warning banner is displayed. See [Section 7: Calibration](#7-calibration) for how to resolve this.

### WiFi Configuration
If the hub is offline, you can:
1. Click **Connect WiFi** to expand the WiFi panel
2. Select a network from the dropdown
3. Enter the password
4. Click **Connect**

---

## 5. Measurements

### Viewing Measurements
Switch between two views using the **Table** / **Plot** toggle:

- **Table view** — Shows each sensor's status (Connected/Disconnected) and current value
- **Plot view** — Shows a horizontal area chart with:
  - Y-axis: sensor height (15 cm to 180 cm)
  - X-axis: force in daN (Deka Newton)
  - Colored dots on the left indicating sensor status (green = connected, yellow = disconnected)

> **Note:** Disconnected sensors display a value of 0 daN.

### Continuous Measurement
1. Toggle **Measure ON/OFF** in the top bar to start/stop continuous measurement
2. When ON, the display updates every 1.2 seconds

### Saving a Measurement
1. (Optional) Enter a name in the **Measurement name** field
2. Click **Store Measurement**
3. The saved measurement appears as a gray "Saved" overlay on the plot
4. Click **Clear** to remove the saved overlay

### Zero Set
Click the **Zero** button to zero all sensors. This compensates for any baseline offset.

---

## 6. Reports

Reports allow you to view and compare saved measurements.

### Viewing a Single Test
1. Select a saved test from either dropdown (A or B)
2. The plot and table automatically display the selected test

### Comparing Two Tests
1. Select **Test A** from the first dropdown
2. Select **Test B** from the second dropdown
3. The comparison plot shows both tests:
   - **Red** = Test A
   - **Blue** = Test B
4. The table shows values side by side

### Loading Files from Disk
Use the **Browse** buttons to load CSV files from disk for comparison.

### Exporting to PDF
Click the **PDF** button to export the current report view to a PDF file.

---

## 7. Calibration

Calibration is essential for accurate measurements. The calibration data is stored in a CSV file specific to each system's serial number.

### Accessing the Calibration Page

The Calibration page is hidden by default to prevent accidental changes.

**To unlock calibration:**
1. Click the **C-Measure** logo/title in the sidebar **10 times**
2. A prompt will appear asking for an access code
3. Enter: **`cal`** and press OK
4. The Calibration page will appear in the navigation

### Calibration Procedure

#### Step 1: Zero (Set Offsets)
1. Ensure all sensors are unloaded (no weight applied)
2. Click the **Zero** button
3. All offset values will be recorded
4. Offset fields will be highlighted to indicate they are set

#### Step 2: Set Gain (for each sensor)
1. Enter the known reference weight in the **Gain weight** field (in daN)
2. Apply the reference weight to **sensor 1**
3. Click the **Set Gain** button next to sensor 1
4. The row turns green when gain is set
5. Repeat for each sensor (1 through 12)

#### Step 3: Save Calibration
Click **Save Calibration** to store the calibration data.

### Calibration File Format

The calibration file is a CSV with the following columns:
- **LoadCell** — Sensor index (0-11)
- **Offset** — Zero offset value
- **Gain** — Gain multiplier
- **CalibratedAt** — Timestamp of calibration

File naming convention: `caldata_<SERIAL>.csv`

Example: `caldata_SN12345.csv`

### Importing a Calibration File

You can import an existing calibration file in the **Settings** page:
1. Go to **Settings**
2. In the **Import Calibration** section, click **Browse** and select a `.csv` file
3. Click **Import**
4. If the file's serial number doesn't match the system, you will be prompted to confirm
5. If a calibration file already exists, a backup is automatically created (with `_1`, `_2`, etc.)

---

## 8. Settings

### Data Directory
The folder where measurements and calibration data are stored.
- Default: `C:\Users\<username>\AppData\Roaming\C-Measure\data`

### Plot Max (X axis)
Sets the maximum value for the X-axis on plots (in daN).
- Leave empty for auto-scaling
- Set a fixed value (e.g., 20) for consistent plot scaling

### Simulation Mode
Toggle simulation mode ON/OFF.
- When ON, the backend generates simulated sensor values (no hardware required)
- Useful for testing and demonstration purposes
- **Requires application restart** after changing this setting

### Import Calibration
Import a calibration CSV file from another system or backup. See [Section 7](#7-calibration) for details.

### System Info
Displays:
- **Version** — Application version
- **Backend** — Live or Simulation mode
- **Data folder** — Current data directory path

---

## 9. Moving the System to Another PC

When transferring C-Measure to a new computer, follow these steps:

### What You Need
1. The **C-Measure installer** (.exe)
2. The **calibration file** for your system

### Step 1: Export the Calibration File
On the **old PC**, locate and copy the calibration file:
1. Open C-Measure and go to **Settings**
2. Note the **Data folder** path shown in the System section
3. Navigate to that folder (e.g., `C:\Users\<user>\AppData\Roaming\C-Measure\data`)
4. Copy the file named `caldata_<SERIAL>.csv` (e.g., `caldata_SN12345.csv`)
5. Save it to a USB drive or network location

> **Important:** Without the calibration file, all measurements will be uncalibrated (raw sensor values). Always keep a backup of your calibration file!

### Step 2: Install on the New PC
1. Run the C-Measure installer on the new PC
2. Install the Phidget22 drivers when prompted
3. Ensure Visual C++ Redistributable is installed

### Step 3: Import the Calibration File
1. Launch C-Measure on the new PC
2. Go to **Settings**
3. Use **Import Calibration** to browse and select your `caldata_<SERIAL>.csv` file
4. Click **Import**
5. Verify that the calibration warning disappears from the Home page
6. Go to the Home page and confirm that "Last calibration" shows the correct date

### Verifying the Transfer
1. Connect the sensor hub
2. Go to **Measurements** and check that all sensors show "Connected"
3. Verify that sensor values look correct (compare with known reference if available)

---

## 10. Troubleshooting

### Backend Error on Startup
**Symptom:** "Could not start the backend server" with error code 4294967295

**Solution:**
- Install Microsoft Visual C++ Redistributable 2015-2022
- Download from: https://aka.ms/vs/17/release/vc_redist.x86.exe

### Hub Offline / Cannot Connect
**Symptom:** Status shows "C-Measure: offline"

**Solutions:**
- Verify the Phidget hub is powered on
- Check WiFi/network connection to the hub
- Try the **Connect WiFi** option on the Home page
- Ensure Phidget22 drivers are installed

### Sensors Show Yellow (Disconnected)
**Symptom:** Some sensors show yellow dots with 0 daN value

**Solutions:**
- Check physical connections to the sensors
- Verify the sensor cables are properly seated
- Restart the application

### Calibration Warning
**Symptom:** "Calibration missing" warning on Home page

**Solutions:**
- Import a calibration file via Settings > Import Calibration
- Or perform a new calibration (see [Section 7](#7-calibration))

### 404 Error in Browser
**Symptom:** Accessing 127.0.0.1:8123 shows "Error 404"

**Explanation:** The backend server is designed to be accessed through the C-Measure application, not directly via a browser. Always launch C-Measure from the Start Menu or shortcut.

### Measurements Not Saving
**Symptom:** Stored measurements are not appearing in Reports

**Solutions:**
- Check the Data directory in Settings
- Ensure the data folder exists and is writable
- Try restarting the application

---

## Factory Settings

Factory settings are available for advanced configuration (serial number assignment, WiFi pre-configuration).

**To access:**
1. Click the **C-Measure** logo/title in the sidebar **10 times**
2. Enter access code: **`fset`**

---

*C-Measure v1.0.0 — Stretch Film Measure System*
