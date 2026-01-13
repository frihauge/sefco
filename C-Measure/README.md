# C-Measure

Electron app with a Python backend. The backend exposes a local HTTP API and serves the UI.

## Run locally

1) Install Electron dependencies

   npm install

2) Start the app

   npm start

## Backend only

python backend/server.py

## Backend notes

- Phidget support uses the Phidget22 Python package.
- When Phidget22 is not available, the backend runs in simulation mode.
- Optional overrides:
  - CMEASURE_DATA_DIR: override the data directory
  - CMEASURE_PORT: override the backend port
  - CMEASURE_SIMULATE: force simulation (1/true/yes)
  - CMEASURE_PYTHON: override python executable for Electron
